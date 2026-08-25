require('dotenv/config');
const { createHash } = require('crypto');
const { readdirSync, readFileSync } = require('fs');
const { join } = require('path');
const { Client } = require('pg');

/**
 * Splits a .sql file into individual statements. Required for pooled
 * connections (e.g. Neon's PgBouncer-based pooler in transaction mode),
 * which don't reliably accept a single multi-statement query the way a
 * direct connection does. Tracks single/double-quote state and -- line
 * comments so semicolons inside comments or string literals are not treated
 * as statement terminators.
 */
function splitStatements(sql) {
  const statements = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];

    // Handle line comment start: -- outside of any string
    if (!inSingleQuote && !inDoubleQuote && !inLineComment &&
        char === '-' && sql[i + 1] === '-') {
      inLineComment = true;
    }

    // End of line comment on newline
    if (inLineComment && char === '\n') {
      inLineComment = false;
    }

    // Track string delimiters (only outside comments)
    if (!inLineComment) {
      if (char === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote;
      else if (char === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote;
    }

    if (char === ';' && !inSingleQuote && !inDoubleQuote && !inLineComment) {
      current += char;
      statements.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements.filter(Boolean);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const ssl = process.env.DATABASE_URL.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined;
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [92810427]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.infra_schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const directory = join(__dirname, '..', 'typeorm-migrations');
    for (const name of readdirSync(directory).filter((file) => file.endsWith('.sql')).sort()) {
      const sql = readFileSync(join(directory, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query('SELECT checksum FROM public.infra_schema_migrations WHERE name = $1', [name]);
      if (existing.rowCount) {
        if (existing.rows[0].checksum !== checksum) throw new Error(`Applied migration ${name} has changed`);
        continue;
      }
      await client.query('BEGIN');
      try {
        for (const statement of splitStatements(sql)) {
          await client.query(statement);
        }
        await client.query('INSERT INTO public.infra_schema_migrations(name, checksum) VALUES ($1, $2)', [name, checksum]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [92810427]).catch(() => undefined);
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
