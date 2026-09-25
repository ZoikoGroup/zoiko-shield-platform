require('dotenv/config');
const { spawnSync } = require('child_process');
const { join } = require('path');
const { Client } = require('pg');

/**
 * Replays every migration into a clean shadow database and compares the
 * result with the Prisma schema. Exit 0: no drift. Exit 2: drift. Exit 1: error.
 *
 * Prisma resets only the schemas the datasource declares before replaying, and
 * `public` is not one of them (it holds only migration history), so leftovers
 * there from an earlier run would make the replay fail or lie. The shadow is
 * therefore emptied completely first. It must be a disposable database.
 */
async function main() {
  const shadow = process.env.SHADOW_DATABASE_URL;
  if (!shadow)
    throw new Error('SHADOW_DATABASE_URL is required (a disposable database)');
  for (const name of ['DATABASE_URL', 'MIGRATION_DATABASE_URL']) {
    if (process.env[name] && process.env[name] === shadow) {
      throw new Error(
        `SHADOW_DATABASE_URL must not be the same database as ${name}`,
      );
    }
  }

  const client = new Client({ connectionString: shadow });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT nspname FROM pg_namespace
        WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema'`,
    );
    for (const { nspname } of rows) {
      await client.query(
        `DROP SCHEMA "${nspname.replace(/"/g, '""')}" CASCADE`,
      );
    }
    await client.query('CREATE SCHEMA public');
  } finally {
    await client.end();
  }

  const result = spawnSync(
    join(__dirname, '..', 'node_modules', '.bin', 'prisma'),
    [
      'migrate',
      'diff',
      '--from-migrations',
      'prisma/migrations',
      '--to-schema',
      'prisma',
      '--exit-code',
    ],
    { stdio: 'inherit', cwd: join(__dirname, '..') },
  );
  process.exitCode = result.status ?? 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
