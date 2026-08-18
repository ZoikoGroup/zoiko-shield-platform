-- R17 Claim Register: replace the mutable, auto-approved key/value row with
-- versioned claim records, independent Legal/Compliance decisions, and a
-- tenant/environment-scoped eligibility projection.

DROP INDEX IF EXISTS "ClaimRegister_claim_key_key";

ALTER TABLE "ClaimRegister"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "channels" TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "scope" TEXT NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "evidence_refs" TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "prohibited_variants" TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "limitations" TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "required_offer_type" TEXT NOT NULL DEFAULT 'MANAGED_DEFENSE',
  ADD COLUMN IF NOT EXISTS "sector_pack_key" TEXT,
  ADD COLUMN IF NOT EXISTS "evidence_max_age_hours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS "monitoring_reference" TEXT NOT NULL DEFAULT 'legacy-claim-requires-review',
  ADD COLUMN IF NOT EXISTS "requested_by" TEXT NOT NULL DEFAULT 'legacy-migration',
  ADD COLUMN IF NOT EXISTS "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "verification_date" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "supersedes_id" TEXT,
  ADD COLUMN IF NOT EXISTS "revoked_by" TEXT,
  ADD COLUMN IF NOT EXISTS "revoked_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "revocation_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Legacy rows did not contain the evidence, scope, expiry, or independent
-- approvals required by R17. They deliberately expire so they fail closed and
-- can be replaced by a complete new version through the governed API.
UPDATE "ClaimRegister"
SET "status" = 'EXPIRED',
    "expires_at" = COALESCE(
      "expires_at",
      "effective_from" + INTERVAL '1 second'
    )
WHERE "expires_at" IS NULL;

ALTER TABLE "ClaimRegister"
  ALTER COLUMN "expires_at" SET NOT NULL;

-- Defaults above exist only to make the in-place backfill safe. New records
-- must supply these controlled values explicitly through the governed API.
ALTER TABLE "ClaimRegister"
  ALTER COLUMN "version" DROP DEFAULT,
  ALTER COLUMN "required_offer_type" DROP DEFAULT,
  ALTER COLUMN "monitoring_reference" DROP DEFAULT,
  ALTER COLUMN "requested_by" DROP DEFAULT,
  ALTER COLUMN "updated_at" DROP DEFAULT;

ALTER TABLE "ClaimRegister"
  DROP COLUMN IF EXISTS "requires_evidence";

ALTER TABLE "ClaimRegister"
  ADD CONSTRAINT "ClaimRegister_version_check" CHECK ("version" > 0),
  ADD CONSTRAINT "ClaimRegister_evidence_max_age_hours_check"
    CHECK ("evidence_max_age_hours" BETWEEN 1 AND 8760),
  ADD CONSTRAINT "ClaimRegister_validity_window_check"
    CHECK ("expires_at" > "effective_from"),
  ADD CONSTRAINT "ClaimRegister_status_check" CHECK (
    "status" IN (
      'PENDING_APPROVAL', 'APPROVED', 'REJECTED',
      'SUPERSEDED', 'REVOKED', 'EXPIRED'
    )
  ),
  ADD CONSTRAINT "ClaimRegister_required_offer_type_check" CHECK (
    "required_offer_type" IN (
      'MANAGED_DEFENSE', 'CONTINUOUS_ASSURANCE',
      'EXPOSURE_MANAGEMENT', 'AI_SECURITY'
    )
  );

CREATE UNIQUE INDEX "ClaimRegister_claim_key_version_key"
  ON "ClaimRegister"("claim_key", "version");
CREATE INDEX "ClaimRegister_claim_key_status_idx"
  ON "ClaimRegister"("claim_key", "status");
CREATE INDEX "ClaimRegister_status_effective_from_expires_at_idx"
  ON "ClaimRegister"("status", "effective_from", "expires_at");

CREATE TABLE "ClaimApproval" (
  "id" TEXT NOT NULL,
  "claim_register_id" TEXT NOT NULL,
  "reviewer_role" TEXT NOT NULL,
  "reviewer_id" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClaimApproval_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClaimApproval_claim_register_id_fkey"
    FOREIGN KEY ("claim_register_id") REFERENCES "ClaimRegister"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ClaimApproval_claim_register_id_reviewer_role_key"
  ON "ClaimApproval"("claim_register_id", "reviewer_role");
CREATE INDEX "ClaimApproval_reviewer_id_idx"
  ON "ClaimApproval"("reviewer_id");
ALTER TABLE "ClaimApproval"
  ADD CONSTRAINT "ClaimApproval_reviewer_role_check"
    CHECK ("reviewer_role" IN ('LEGAL', 'COMPLIANCE')),
  ADD CONSTRAINT "ClaimApproval_decision_check"
    CHECK ("decision" IN ('APPROVED', 'REJECTED'));

CREATE TABLE "ClaimEligibility" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "context_key" TEXT NOT NULL,
  "claim_key" TEXT NOT NULL,
  "claim_register_id" TEXT,
  "claim_version" INTEGER,
  "channel" TEXT NOT NULL,
  "sector_pack_key" TEXT,
  "status" TEXT NOT NULL,
  "reason_code" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "approved_wording" TEXT,
  "runtime_evaluation_id" TEXT,
  "evidence_refs" TEXT NOT NULL DEFAULT '[]',
  "evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "valid_until" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClaimEligibility_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClaimEligibility_claim_register_id_fkey"
    FOREIGN KEY ("claim_register_id") REFERENCES "ClaimRegister"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ClaimEligibility_context_key_key"
  ON "ClaimEligibility"("context_key");
CREATE INDEX "ClaimEligibility_tenant_id_claim_key_idx"
  ON "ClaimEligibility"("tenant_id", "claim_key");
CREATE INDEX "ClaimEligibility_status_idx"
  ON "ClaimEligibility"("status");
ALTER TABLE "ClaimEligibility"
  ALTER COLUMN "updated_at" DROP DEFAULT,
  ADD CONSTRAINT "ClaimEligibility_status_check"
    CHECK ("status" IN ('ELIGIBLE', 'INELIGIBLE'));
