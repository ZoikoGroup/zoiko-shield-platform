import 'dotenv/config';
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
    console.log('Adding missing columns to authorization.tenant_memberships...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "authorization"."tenant_memberships" 
      ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMPTZ(6),
      ADD COLUMN IF NOT EXISTS "elevationPurpose" VARCHAR,
      ADD COLUMN IF NOT EXISTS "elevationApprovedBy" UUID;
    `);
    console.log('Columns added successfully.');

    // Check again
    const columns: any[] = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'authorization' AND table_name = 'tenant_memberships'
      ORDER BY ordinal_position;
    `;
    console.table(columns);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
