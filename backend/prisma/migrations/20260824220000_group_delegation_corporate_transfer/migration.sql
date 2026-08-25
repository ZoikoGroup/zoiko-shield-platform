-- Category A2: governed group aggregation is represented explicitly instead
-- of treating a free-form commercial_account.group_account_id as authority.
CREATE TABLE "GroupAccount" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "customer_legal_name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GroupAccount_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GroupAccount_status_idx" ON "GroupAccount"("status");

-- Preserve pre-existing identifiers but require platform review before they
-- can be used by a newly-created account or governed group change.
INSERT INTO "GroupAccount" (
  "id", "name", "customer_legal_name", "status", "updated_at"
)
SELECT DISTINCT
  account."group_account_id",
  'Migrated group ' || account."group_account_id",
  'Requires verification',
  'MIGRATION_REVIEW',
  CURRENT_TIMESTAMP
FROM "CommercialAccount" account
WHERE account."group_account_id" IS NOT NULL;

ALTER TABLE "CommercialAccount"
  ADD CONSTRAINT "CommercialAccount_group_account_id_fkey"
  FOREIGN KEY ("group_account_id") REFERENCES "GroupAccount"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Category A5: the plan records the immutable boundary decisions. Execution
-- closes source commercial records and creates future target records; no SQL
-- in this migration or the service bulk-reassigns EvidenceRecord rows.
CREATE TABLE "CorporateTransfer" (
  "id" TEXT NOT NULL,
  "source_commercial_account_id" TEXT NOT NULL,
  "source_binding_id" TEXT NOT NULL,
  "source_tenant_id" TEXT NOT NULL,
  "source_environment_id" TEXT NOT NULL,
  "source_binding_updated_at" TIMESTAMP(3) NOT NULL,
  "target_commercial_account_id" TEXT NOT NULL,
  "target_tenant_id" TEXT NOT NULL,
  "target_environment_id" TEXT NOT NULL,
  "target_legal_entity_id" TEXT NOT NULL,
  "target_business_unit_id" TEXT,
  "target_region" TEXT NOT NULL,
  "target_residency_policy" TEXT NOT NULL,
  "target_service_scope" TEXT NOT NULL DEFAULT '[]',
  "effective_at" TIMESTAMP(3) NOT NULL,
  "data_decision" TEXT NOT NULL DEFAULT 'RETAIN_HISTORICAL_AT_SOURCE',
  "export_decision" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  "export_manifest_id" TEXT,
  "legal_hold_decision" TEXT NOT NULL DEFAULT 'PRESERVE_IN_SOURCE',
  "legal_hold_references" TEXT NOT NULL DEFAULT '[]',
  "entitlement_mapping" TEXT NOT NULL DEFAULT '[]',
  "evidence_lineage_policy" TEXT NOT NULL DEFAULT 'PRESERVE_SOURCE_IDENTIFIERS',
  "evidence_boundary_snapshot" TEXT NOT NULL DEFAULT '{}',
  "source_approval_id" TEXT,
  "target_approval_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  "requested_by" TEXT NOT NULL,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "executed_by" TEXT,
  "executed_at" TIMESTAMP(3),
  "reconciled_by" TEXT,
  "reconciled_at" TIMESTAMP(3),
  "reconciliation_result" TEXT NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CorporateTransfer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CorporateTransfer_source_approval_id_key"
  ON "CorporateTransfer"("source_approval_id");
CREATE UNIQUE INDEX "CorporateTransfer_target_approval_id_key"
  ON "CorporateTransfer"("target_approval_id");
CREATE INDEX "CorporateTransfer_source_tenant_id_status_idx"
  ON "CorporateTransfer"("source_tenant_id", "status");
CREATE INDEX "CorporateTransfer_target_tenant_id_status_idx"
  ON "CorporateTransfer"("target_tenant_id", "status");
CREATE INDEX "CorporateTransfer_source_commercial_account_id_idx"
  ON "CorporateTransfer"("source_commercial_account_id");
CREATE INDEX "CorporateTransfer_target_commercial_account_id_idx"
  ON "CorporateTransfer"("target_commercial_account_id");
CREATE INDEX "CorporateTransfer_effective_at_status_idx"
  ON "CorporateTransfer"("effective_at", "status");
ALTER TABLE "CorporateTransfer"
  ADD CONSTRAINT "CorporateTransfer_source_commercial_account_id_fkey"
  FOREIGN KEY ("source_commercial_account_id") REFERENCES "CommercialAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CorporateTransfer"
  ADD CONSTRAINT "CorporateTransfer_target_commercial_account_id_fkey"
  FOREIGN KEY ("target_commercial_account_id") REFERENCES "CommercialAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Category A4: old delegations lacked tenant, identity and managing-org
-- context. They are disabled for explicit customer review rather than being
-- silently upgraded into broader authority.
ALTER TABLE "Partner"
  ADD COLUMN "managing_organization_id" TEXT;
UPDATE "Partner"
SET "managing_organization_id" = "id";
ALTER TABLE "Partner"
  ALTER COLUMN "managing_organization_id" SET NOT NULL;
CREATE UNIQUE INDEX "Partner_managing_organization_id_key"
  ON "Partner"("managing_organization_id");

ALTER TABLE "PartnerDelegation"
  ADD COLUMN "managing_organization_id" TEXT,
  ADD COLUMN "partner_principal_id" TEXT,
  ADD COLUMN "tenant_id" TEXT,
  ADD COLUMN "environment_id" TEXT,
  ADD COLUMN "customer_visible" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "revoked_by" TEXT,
  ADD COLUMN "revocation_reason" TEXT,
  ADD COLUMN "updated_at" TIMESTAMP(3);

UPDATE "PartnerDelegation"
SET
  "managing_organization_id" = "partner_id",
  "partner_principal_id" = 'migration-review',
  "tenant_id" = 'migration-review',
  "environment_id" = 'default-env',
  "status" = 'MIGRATION_REVIEW',
  "expires_at" = COALESCE("expires_at", CURRENT_TIMESTAMP),
  "updated_at" = "created_at";

ALTER TABLE "PartnerDelegation"
  ALTER COLUMN "managing_organization_id" SET NOT NULL,
  ALTER COLUMN "partner_principal_id" SET NOT NULL,
  ALTER COLUMN "tenant_id" SET NOT NULL,
  ALTER COLUMN "environment_id" SET NOT NULL,
  ALTER COLUMN "expires_at" SET NOT NULL,
  ALTER COLUMN "updated_at" SET NOT NULL;

DROP INDEX "PartnerDelegation_commercial_account_id_idx";
CREATE INDEX "PartnerDelegation_commercial_account_id_tenant_id_environment_id_idx"
  ON "PartnerDelegation"("commercial_account_id", "tenant_id", "environment_id");
CREATE INDEX "PartnerDelegation_tenant_id_status_idx"
  ON "PartnerDelegation"("tenant_id", "status");
CREATE INDEX "PartnerDelegation_partner_principal_id_tenant_id_status_idx"
  ON "PartnerDelegation"("partner_principal_id", "tenant_id", "status");
CREATE INDEX "PartnerDelegation_managing_organization_id_status_idx"
  ON "PartnerDelegation"("managing_organization_id", "status");
ALTER TABLE "PartnerDelegation"
  ADD CONSTRAINT "PartnerDelegation_partner_id_fkey"
  FOREIGN KEY ("partner_id") REFERENCES "Partner"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
