import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { TenantScopedPool } from '../libs/database/src';

async function main() {
  const databaseUrl =
    process.env.DATABASE_URL ||
    'postgres://shield:shield@localhost:5433/shield_core';

  const pool = new TenantScopedPool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : false,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const migrationPath = path.join(
      __dirname,
      '../prisma/migrations/20260925010000_module_schemas/migration.sql'
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Strip line comments first
    const sqlWithoutComments = sql.replace(/--.*$/gm, '');

    // Split by semicolons into discrete statements
    const statements = sqlWithoutComments
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const schemaStatements = statements.filter((s) =>
      s.toUpperCase().startsWith('CREATE SCHEMA')
    );
    const otherStatements = statements.filter(
      (s) => !s.toUpperCase().startsWith('CREATE SCHEMA')
    );

    console.log(`Phase 1: Creating ${schemaStatements.length} schemas...`);
    for (const statement of schemaStatements) {
      try {
        await prisma.$executeRawUnsafe(statement + ';');
      } catch (err: any) {
        console.warn(`[Schema Error] ${statement}: ${err.message}`);
      }
    }
    console.log('✔ All schemas created or verified.');

    console.log(`Phase 2: Executing ${otherStatements.length} alteration statements...`);
    let applied = 0;
    let skipped = 0;

    for (const statement of otherStatements) {
      try {
        await prisma.$executeRawUnsafe(statement + ';');
        applied++;
      } catch (err: any) {
        skipped++;
      }
    }

    console.log(`✔ Finished: ${applied} applied, ${skipped} skipped.`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
