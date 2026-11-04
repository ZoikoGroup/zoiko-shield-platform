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
    console.log('Creating authorization.config_policy_versions and config_policy_audit_events tables...');
    
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "authorization"."config_policy_versions" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenantId" UUID,
        "policyKey" VARCHAR(150) NOT NULL,
        "policyName" VARCHAR(255) NOT NULL,
        "domain" VARCHAR(40) NOT NULL,
        "version" VARCHAR(40) NOT NULL,
        "status" VARCHAR(40) NOT NULL DEFAULT 'PENDING_APPROVAL',
        "stagedEnvironment" VARCHAR(100),
        "canaryPercentage" INTEGER NOT NULL DEFAULT 0,
        "author" VARCHAR(255) NOT NULL,
        "approvers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        "commitHash" VARCHAR(64) NOT NULL,
        "diffSummary" TEXT NOT NULL,
        "diffPrevious" TEXT NOT NULL,
        "diffProposed" TEXT NOT NULL,
        "reversalReason" TEXT,
        "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "config_policy_versions_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "config_policy_versions_tenantId_policyKey_key"
        ON "authorization"."config_policy_versions"("tenantId", "policyKey");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "config_policy_versions_tenantId_idx"
        ON "authorization"."config_policy_versions"("tenantId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "authorization"."config_policy_audit_events" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenantId" UUID NOT NULL,
        "policyVersionId" UUID NOT NULL,
        "action" VARCHAR(40) NOT NULL,
        "actorId" VARCHAR(255) NOT NULL,
        "detail" TEXT NOT NULL,
        "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "config_policy_audit_events_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "config_policy_audit_events_tenantId_idx"
        ON "authorization"."config_policy_audit_events"("tenantId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "config_policy_audit_events_policyVersionId_idx"
        ON "authorization"."config_policy_audit_events"("policyVersionId");
    `);

    console.log('Tables and indexes created successfully.');

    const tables: any[] = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'authorization' AND table_name LIKE 'config_policy%'
      ORDER BY table_name;
    `;
    console.table(tables);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
