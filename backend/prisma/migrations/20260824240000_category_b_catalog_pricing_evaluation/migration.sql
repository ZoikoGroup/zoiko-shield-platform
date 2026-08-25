-- Category B1: stable internal identities, explicit launch gates and complete
-- bundle relationship semantics. Existing SKU values are the safest legacy
-- backfill; all new API writes require an explicit internal key.
ALTER TABLE "Product" ADD COLUMN "internal_product_key" TEXT;
UPDATE "Product" SET "internal_product_key" = "sku"
WHERE "internal_product_key" IS NULL;
ALTER TABLE "Product" ALTER COLUMN "internal_product_key" SET NOT NULL;
ALTER TABLE "Product" ADD COLUMN "launch_class" TEXT NOT NULL DEFAULT 'PHASE_GATED';
ALTER TABLE "Product" ADD COLUMN "release_status" TEXT NOT NULL DEFAULT 'GATED';
ALTER TABLE "Product" ADD COLUMN "bundle_rules" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Product" ADD COLUMN "released_by" TEXT;
ALTER TABLE "Product" ADD COLUMN "released_at" TIMESTAMP(3);

-- Legacy canonical entry families become candidates, never silently released.
UPDATE "Product"
SET "launch_class" = 'ENTRY_OFFER', "release_status" = 'CANDIDATE'
WHERE "offer_family" IN ('MANAGED_DEFENSE', 'CONTINUOUS_ASSURANCE');

CREATE UNIQUE INDEX "Product_catalog_version_id_internal_product_key_key"
  ON "Product"("catalog_version_id", "internal_product_key");
CREATE INDEX "Product_internal_product_key_idx" ON "Product"("internal_product_key");
CREATE INDEX "Product_release_status_idx" ON "Product"("release_status");

-- Category B2: all prices remain bespoke unless disclosure is explicitly
-- approved. Existing APPROVED rows lose usability until reconciled through a
-- linked Finance/Commercial approval; fail-closed is intentional.
ALTER TABLE "PriceBook" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'BESPOKE';
ALTER TABLE "PriceBook" ADD COLUMN "commercial_account_id" TEXT;
ALTER TABLE "PriceBook" ADD COLUMN "approval_id" TEXT;
ALTER TABLE "PriceBook" ADD COLUMN "public_disclosure_approved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PriceBook" ADD COLUMN "approved_by" TEXT;
ALTER TABLE "PriceBook" ADD COLUMN "approved_at" TIMESTAMP(3);
CREATE UNIQUE INDEX "PriceBook_approval_id_key" ON "PriceBook"("approval_id");
CREATE INDEX "PriceBook_commercial_account_id_status_idx"
  ON "PriceBook"("commercial_account_id", "status");
ALTER TABLE "PriceBook"
  ADD CONSTRAINT "PriceBook_commercial_account_id_fkey"
  FOREIGN KEY ("commercial_account_id") REFERENCES "CommercialAccount"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
UPDATE "PriceBook"
SET "status" = 'MIGRATION_REVIEW', "margin_gate_passed" = false
WHERE "status" = 'APPROVED';

-- Category B3: explicit, bounded design-partner/evaluation/pilot governance.
CREATE TABLE "EvaluationProgram" (
  "id" TEXT NOT NULL,
  "program_key" TEXT NOT NULL,
  "program_type" TEXT NOT NULL,
  "commercial_account_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "starts_at" TIMESTAMP(3) NOT NULL,
  "ends_at" TIMESTAMP(3) NOT NULL,
  "data_classes" TEXT NOT NULL DEFAULT '[]',
  "connector_scope" TEXT NOT NULL DEFAULT '[]',
  "entitlement_scope" TEXT NOT NULL DEFAULT '[]',
  "service_coverage" TEXT NOT NULL DEFAULT '[]',
  "response_authority" TEXT NOT NULL DEFAULT 'NONE',
  "payment_requirement" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  "payment_reference_id" TEXT,
  "conversion_policy" TEXT NOT NULL DEFAULT 'EXPIRE',
  "expiry_action" TEXT NOT NULL DEFAULT 'REVOKE_ENTITLEMENTS',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "approval_id" TEXT,
  "requested_by" TEXT NOT NULL,
  "approved_by" TEXT,
  "approved_at" TIMESTAMP(3),
  "activated_at" TIMESTAMP(3),
  "expired_at" TIMESTAMP(3),
  "converted_order_id" TEXT,
  "converted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EvaluationProgram_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EvaluationProgram_program_key_key" ON "EvaluationProgram"("program_key");
CREATE UNIQUE INDEX "EvaluationProgram_approval_id_key" ON "EvaluationProgram"("approval_id");
CREATE INDEX "EvaluationProgram_commercial_account_id_status_idx"
  ON "EvaluationProgram"("commercial_account_id", "status");
CREATE INDEX "EvaluationProgram_tenant_id_environment_id_status_idx"
  ON "EvaluationProgram"("tenant_id", "environment_id", "status");
CREATE INDEX "EvaluationProgram_starts_at_status_idx" ON "EvaluationProgram"("starts_at", "status");
CREATE INDEX "EvaluationProgram_ends_at_status_idx" ON "EvaluationProgram"("ends_at", "status");

ALTER TABLE "EvaluationProgram"
  ADD CONSTRAINT "EvaluationProgram_commercial_account_id_fkey"
  FOREIGN KEY ("commercial_account_id") REFERENCES "CommercialAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EvaluationProgram"
  ADD CONSTRAINT "EvaluationProgram_converted_order_id_fkey"
  FOREIGN KEY ("converted_order_id") REFERENCES "CommercialOrder"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Entitlement" ADD COLUMN "source_type" TEXT NOT NULL DEFAULT 'ACCEPTED_ORDER';
ALTER TABLE "Entitlement" ADD COLUMN "source_id" TEXT;
ALTER TABLE "Entitlement" ADD COLUMN "evaluation_program_id" TEXT;
CREATE INDEX "Entitlement_source_type_source_id_idx" ON "Entitlement"("source_type", "source_id");
CREATE INDEX "Entitlement_evaluation_program_id_status_idx"
  ON "Entitlement"("evaluation_program_id", "status");
ALTER TABLE "Entitlement"
  ADD CONSTRAINT "Entitlement_evaluation_program_id_fkey"
  FOREIGN KEY ("evaluation_program_id") REFERENCES "EvaluationProgram"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
