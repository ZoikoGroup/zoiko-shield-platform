-- AlterTable: durable checkpoint state so a rerun resumes incomplete work
-- instead of repeating it, and retries stay bounded (ZS-ENG-OFF-DEL-001 1/4).
ALTER TABLE "DeletionTask" ADD COLUMN     "attempt" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_attempt_at" TIMESTAMP(3),
ADD COLUMN     "last_checkpoint" TEXT;

-- CreateTable: independent post-deletion reconciliation (decision 2).
CREATE TABLE "DeletionVerification" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "deletion_request_id" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "surfaces" TEXT NOT NULL DEFAULT '[]',
    "residual_count" INTEGER NOT NULL DEFAULT 0,
    "retained_count" INTEGER NOT NULL DEFAULT 0,
    "verified_by" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeletionVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeletionVerification_deletion_request_id_idx" ON "DeletionVerification"("deletion_request_id");

-- CreateIndex
CREATE INDEX "DeletionVerification_tenant_id_result_idx" ON "DeletionVerification"("tenant_id", "result");

-- CreateIndex
CREATE INDEX "DeletionTask_status_idx" ON "DeletionTask"("status");

-- CreateIndex: one task per store per request IS the idempotency key.
CREATE UNIQUE INDEX "DeletionTask_deletion_request_id_store_type_key" ON "DeletionTask"("deletion_request_id", "store_type");

-- AddForeignKey
ALTER TABLE "DeletionVerification" ADD CONSTRAINT "DeletionVerification_deletion_request_id_fkey" FOREIGN KEY ("deletion_request_id") REFERENCES "DeletionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: retention eligibility is a hard gate, distinct from approval.
ALTER TABLE "DeletionRequest" ADD COLUMN     "retention_policy_id" TEXT,
ADD COLUMN     "retention_basis" TEXT,
ADD COLUMN     "retention_period_days" INTEGER,
ADD COLUMN     "retention_clock_started_at" TIMESTAMP(3),
ADD COLUMN     "retention_expires_at" TIMESTAMP(3);

-- CreateTable: authoritative retention schedule per tenant.
CREATE TABLE "TenantRetentionPolicy" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "basis" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "period_days" INTEGER NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantRetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantRetentionPolicy_tenant_id_effective_from_idx" ON "TenantRetentionPolicy"("tenant_id", "effective_from");
