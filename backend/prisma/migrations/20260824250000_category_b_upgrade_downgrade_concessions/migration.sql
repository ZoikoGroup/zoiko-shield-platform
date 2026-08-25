-- Category B4-B5: typed subscription changes with explicit approval linkage,
-- pending activation readiness, safety assessment and remediation evidence.
ALTER TABLE "CommercialAmendment" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "CommercialAmendment" ADD COLUMN "environment_id" TEXT;
ALTER TABLE "CommercialAmendment" ADD COLUMN "approval_id" TEXT;
ALTER TABLE "CommercialAmendment" ADD COLUMN "claim_eligibility" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CommercialAmendment" ADD COLUMN "deployment_ready" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CommercialAmendment" ADD COLUMN "service_capacity_ready" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CommercialAmendment" ADD COLUMN "readiness_snapshot" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "CommercialAmendment" ADD COLUMN "readiness_verified_by" TEXT;
ALTER TABLE "CommercialAmendment" ADD COLUMN "readiness_verified_at" TIMESTAMP(3);
ALTER TABLE "CommercialAmendment" ADD COLUMN "assessment_snapshot" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "CommercialAmendment" ADD COLUMN "remediation_plan" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "CommercialAmendment" ADD COLUMN "remediation_status" TEXT NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE "CommercialAmendment" ADD COLUMN "applied_by" TEXT;
ALTER TABLE "CommercialAmendment" ADD COLUMN "applied_at" TIMESTAMP(3);
CREATE UNIQUE INDEX "CommercialAmendment_approval_id_key"
  ON "CommercialAmendment"("approval_id");
CREATE INDEX "CommercialAmendment_tenant_id_environment_id_status_idx"
  ON "CommercialAmendment"("tenant_id", "environment_id", "status");
CREATE INDEX "CommercialAmendment_effective_at_status_idx"
  ON "CommercialAmendment"("effective_at", "status");

-- Legacy generic amendments cannot prove the new domain prerequisites and
-- therefore require explicit review instead of remaining executable.
UPDATE "CommercialAmendment"
SET "status" = 'MIGRATION_REVIEW'
WHERE "status" IN ('REQUESTED', 'APPROVED');

-- Category B6: a free module/concession always carries bounded scope, dates,
-- commercial rationale, independent approval, margin impact and renewal rule.
CREATE TABLE "CommercialConcession" (
  "id" TEXT NOT NULL,
  "subscription_id" TEXT NOT NULL,
  "commercial_account_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "scope" TEXT NOT NULL DEFAULT '[]',
  "starts_at" TIMESTAMP(3) NOT NULL,
  "ends_at" TIMESTAMP(3) NOT NULL,
  "commercial_reason" TEXT NOT NULL,
  "margin_impact" DECIMAL(8,4) NOT NULL,
  "renewal_treatment" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  "approval_id" TEXT,
  "requested_by" TEXT NOT NULL,
  "approved_by" TEXT,
  "approved_at" TIMESTAMP(3),
  "activated_at" TIMESTAMP(3),
  "expired_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommercialConcession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CommercialConcession_approval_id_key"
  ON "CommercialConcession"("approval_id");
CREATE INDEX "CommercialConcession_subscription_id_status_idx"
  ON "CommercialConcession"("subscription_id", "status");
CREATE INDEX "CommercialConcession_commercial_account_id_status_idx"
  ON "CommercialConcession"("commercial_account_id", "status");
CREATE INDEX "CommercialConcession_tenant_id_environment_id_status_idx"
  ON "CommercialConcession"("tenant_id", "environment_id", "status");
CREATE INDEX "CommercialConcession_starts_at_status_idx"
  ON "CommercialConcession"("starts_at", "status");
CREATE INDEX "CommercialConcession_ends_at_status_idx"
  ON "CommercialConcession"("ends_at", "status");
ALTER TABLE "CommercialConcession"
  ADD CONSTRAINT "CommercialConcession_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "CommercialSubscription"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommercialConcession"
  ADD CONSTRAINT "CommercialConcession_commercial_account_id_fkey"
  FOREIGN KEY ("commercial_account_id") REFERENCES "CommercialAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Entitlement" ADD COLUMN "activation_amendment_id" TEXT;
ALTER TABLE "Entitlement" ADD COLUMN "concession_id" TEXT;
CREATE INDEX "Entitlement_activation_amendment_id_status_idx"
  ON "Entitlement"("activation_amendment_id", "status");
CREATE INDEX "Entitlement_concession_id_status_idx"
  ON "Entitlement"("concession_id", "status");
ALTER TABLE "Entitlement"
  ADD CONSTRAINT "Entitlement_activation_amendment_id_fkey"
  FOREIGN KEY ("activation_amendment_id") REFERENCES "CommercialAmendment"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Entitlement"
  ADD CONSTRAINT "Entitlement_concession_id_fkey"
  FOREIGN KEY ("concession_id") REFERENCES "CommercialConcession"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

