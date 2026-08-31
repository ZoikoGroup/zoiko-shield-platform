ALTER TABLE "LegalHold"
  ADD COLUMN "released_by" TEXT,
  ADD COLUMN "release_reason" TEXT,
  ADD COLUMN "released_at" TIMESTAMP(3);

ALTER TABLE "DeletionRequest"
  ADD COLUMN "request_authority" TEXT NOT NULL DEFAULT 'TENANT_CONTROLLER',
  ADD COLUMN "subject_reference" TEXT,
  ADD COLUMN "identity_verification_status" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "statutory_deadline_at" TIMESTAMP(3),
  ADD COLUMN "conflicting_legal_hold_ids" TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN "reviewed_by" TEXT,
  ADD COLUMN "reviewed_at" TIMESTAMP(3),
  ADD COLUMN "decision_reason" TEXT,
  ADD COLUMN "outcome" TEXT;

CREATE INDEX "DeletionRequest_tenant_id_status_idx"
  ON "DeletionRequest"("tenant_id", "status");

CREATE INDEX "LegalHold_tenant_id_status_idx"
  ON "LegalHold"("tenant_id", "status");
