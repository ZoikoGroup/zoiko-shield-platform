import 'dotenv/config';
import { Client } from 'pg';

async function main() {
  const databaseUrl =
    process.env.DATABASE_URL ||
    'postgres://shield:shield@localhost:5433/shield_core';

  const client = new Client({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : false,
  });

  await client.connect();

  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS "authorization";`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "authorization"."jit_elevation_requests" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "superAdminPrincipalId" UUID NOT NULL,
        "targetTenantId" UUID NOT NULL,
        "statedPurpose" TEXT NOT NULL,
        "requestedDurationMinutes" INTEGER NOT NULL DEFAULT 60,
        "roleCode" VARCHAR NOT NULL DEFAULT 'TENANT_SECURITY_ANALYST',
        status VARCHAR NOT NULL DEFAULT 'PENDING',
        "approvedByPrincipalId" UUID,
        "rejectionReason" TEXT,
        "approvedAt" TIMESTAMPTZ(6),
        "expiresAt" TIMESTAMPTZ(6),
        "membershipId" UUID,
        "customerVisibleAuditLogRef" VARCHAR(64) NOT NULL DEFAULT '',
        "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS jit_elevation_requests_admin_tenant_idx 
        ON "authorization"."jit_elevation_requests" ("superAdminPrincipalId", "targetTenantId");
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS jit_elevation_requests_tenant_status_idx 
        ON "authorization"."jit_elevation_requests" ("targetTenantId", status);
    `);
    console.log('✔ Successfully created authorization.jit_elevation_requests table.');
  } finally {
    await client.end();
  }
}

main().catch(console.error);
