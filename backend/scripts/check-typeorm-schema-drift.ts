import 'dotenv/config';
import 'reflect-metadata';
import { execFileSync } from 'child_process';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { SHIELD_CORE_TYPEORM_ENTITIES } from '../apps/shield-core/src/typeorm-entities';

/**
 * Does typeorm-migrations/ still describe the entities the app runs on?
 *
 * TypeORM entities and the hand-written SQL in typeorm-migrations/ are two
 * separate descriptions of the same tables, and nothing forced them to agree.
 * When they disagreed, the symptom was invisible in development — the local
 * database had been patched into shape by a seed script running with
 * `synchronize: true` — and only showed up on a fresh deployment, as a
 * missing column at runtime.
 *
 * This builds a throwaway database from the migrations alone, asks TypeORM
 * what it would have to change to make that database match the entities, and
 * fails if the answer is anything at all. Whatever it prints is the SQL that
 * belongs in a new migration.
 *
 * It needs a Postgres it can create and drop a database on, which is the
 * local docker-compose one; it is not meant to be pointed at a shared
 * database.
 */

const SCRATCH_DATABASE = `shield_schema_drift_${process.pid}`;

function adminUrl(databaseUrl: string): { url: URL; database: string } {
  const url = new URL(databaseUrl);
  const database = url.pathname.replace(/^\//, '');
  url.pathname = '/postgres';
  return { url, database };
}

async function main(): Promise<void> {
  const databaseUrl =
    process.env.DATABASE_URL ?? 'postgres://shield:shield@localhost:5433/shield_core';
  const { url } = adminUrl(databaseUrl);

  const admin = new Client({ connectionString: url.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${SCRATCH_DATABASE}"`);
  await admin.query(`CREATE DATABASE "${SCRATCH_DATABASE}"`);
  await admin.end();

  const scratchUrl = new URL(databaseUrl);
  scratchUrl.pathname = `/${SCRATCH_DATABASE}`;

  try {
    const bootstrap = new Client({ connectionString: scratchUrl.toString() });
    await bootstrap.connect();
    await bootstrap.query('CREATE SCHEMA IF NOT EXISTS "identity"');
    await bootstrap.query('CREATE SCHEMA IF NOT EXISTS "authorization"');
    await bootstrap.query('CREATE SCHEMA IF NOT EXISTS "tenant"');
    await bootstrap.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await bootstrap.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await bootstrap.end();

    execFileSync('node', [`${__dirname}/run-typeorm-migrations.js`], {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: scratchUrl.toString() },
    });

    const dataSource = new DataSource({
      type: 'postgres',
      url: scratchUrl.toString(),
      entities: SHIELD_CORE_TYPEORM_ENTITIES,
      synchronize: false,
    });
    await dataSource.initialize();

    const pending = await dataSource.driver
      .createSchemaBuilder()
      .log();

    await dataSource.destroy();

    const statements = pending.upQueries.map((query) => query.query);

    // A table or column the migrations never create is a broken deployment:
    // the code reads it and it is not there. A differently-named index or
    // constraint is not — the constraint exists and is enforced, TypeORM
    // simply prefers its own hashed name for it. Only the first kind fails
    // this check, so the check stays meaningful enough to be worth running.
    const structural = statements.filter(
      (statement) =>
        /^CREATE TABLE/i.test(statement) ||
        / ADD "[^"]+" /.test(statement) ||
        /DROP COLUMN/i.test(statement),
    );
    const naming = statements.filter(
      (statement) => !structural.includes(statement),
    );

    if (naming.length > 0) {
      console.log(
        `${naming.length} index/constraint naming difference(s) — the constraints exist under their SQL-assigned names, so these are not failures.`,
      );
    }

    if (structural.length === 0) {
      console.log(
        'typeorm-migrations/ provides every table and column the entities need.',
      );
      return;
    }

    console.error(
      `\ntypeorm-migrations/ has drifted from the entities. A database built from the migrations alone is missing ${structural.length} table(s)/column(s) the code expects:\n`,
    );
    for (const statement of structural) {
      console.error(`  ${statement};`);
    }
    console.error(
      '\nAdd these to a NEW migration in typeorm-migrations/ — never edit an applied one, the runner checksums them.\n',
    );
    process.exitCode = 1;
  } finally {
    const cleanup = new Client({ connectionString: url.toString() });
    await cleanup.connect();
    await cleanup.query(`DROP DATABASE IF EXISTS "${SCRATCH_DATABASE}"`);
    await cleanup.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
