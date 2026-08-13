const { createHash } = require('crypto');
const { readdirSync, readFileSync } = require('fs');
const { join } = require('path');
const { Client } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
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
        await client.query(sql);
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
