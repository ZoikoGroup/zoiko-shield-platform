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
    console.log('Adding missing columns to audit_package.AuditPackage...');
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'audit_package' AND table_name = 'AuditPackage') THEN
          ALTER TABLE "audit_package"."AuditPackage" 
            ADD COLUMN IF NOT EXISTS "continuous_assurance_profile_id" TEXT,
            ADD COLUMN IF NOT EXISTS "completeness_state" TEXT NOT NULL DEFAULT 'UNKNOWN',
            ADD COLUMN IF NOT EXISTS "missing_evidence" TEXT NOT NULL DEFAULT '[]',
            ADD COLUMN IF NOT EXISTS "freshness_state" TEXT NOT NULL DEFAULT 'UNKNOWN',
            ADD COLUMN IF NOT EXISTS "limitations" TEXT NOT NULL DEFAULT '[]',
            ADD COLUMN IF NOT EXISTS "verifier_compatibility" TEXT NOT NULL DEFAULT 'UNKNOWN',
            ADD COLUMN IF NOT EXISTS "claim_eligibility" BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS "claim_eligibility_reason" TEXT NOT NULL DEFAULT 'PACKAGE_NOT_VALIDATED',
            ADD COLUMN IF NOT EXISTS "approved_claim_wording" TEXT,
            ADD COLUMN IF NOT EXISTS "claim_assessed_at" TIMESTAMP(3),
            ADD COLUMN IF NOT EXISTS "frozen_manifest_hash" TEXT,
            ADD COLUMN IF NOT EXISTS "retention_profile" TEXT,
            ADD COLUMN IF NOT EXISTS "retention_until" TIMESTAMP(3),
            ADD COLUMN IF NOT EXISTS "audit_cycle_reference" TEXT;
        END IF;
      END $$;
    `);

    console.log('Adding missing columns to evidence.EvidenceRecord...');
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'evidence' AND table_name = 'EvidenceRecord') THEN
          ALTER TABLE "evidence"."EvidenceRecord" 
            ADD COLUMN IF NOT EXISTS "collection_method" TEXT NOT NULL DEFAULT 'AUTOMATED',
            ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP(3),
            ADD COLUMN IF NOT EXISTS "manual_review_required" BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS "manual_reviewed_at" TIMESTAMP(3),
            ADD COLUMN IF NOT EXISTS "manual_reviewed_by" TEXT,
            ADD COLUMN IF NOT EXISTS "upload_reason" TEXT,
            ADD COLUMN IF NOT EXISTS "uploader_identity" TEXT,
            ADD COLUMN IF NOT EXISTS "collector_nonce" TEXT,
            ADD COLUMN IF NOT EXISTS "collector_signature" TEXT,
            ADD COLUMN IF NOT EXISTS "collector_signing_key_id" TEXT;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'EvidenceRecord') THEN
          ALTER TABLE "public"."EvidenceRecord" 
            ADD COLUMN IF NOT EXISTS "collection_method" TEXT NOT NULL DEFAULT 'AUTOMATED',
            ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP(3),
            ADD COLUMN IF NOT EXISTS "manual_review_required" BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS "manual_reviewed_at" TIMESTAMP(3),
            ADD COLUMN IF NOT EXISTS "manual_reviewed_by" TEXT,
            ADD COLUMN IF NOT EXISTS "upload_reason" TEXT,
            ADD COLUMN IF NOT EXISTS "uploader_identity" TEXT,
            ADD COLUMN IF NOT EXISTS "collector_nonce" TEXT,
            ADD COLUMN IF NOT EXISTS "collector_signature" TEXT,
            ADD COLUMN IF NOT EXISTS "collector_signing_key_id" TEXT;
        END IF;
      END $$;
    `);

    console.log('✔ Columns added successfully!');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
