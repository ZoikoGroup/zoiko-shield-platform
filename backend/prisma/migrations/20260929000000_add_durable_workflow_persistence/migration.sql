-- Durable containment-escalation workflow persistence.
--
-- These tables live in the existing action schema and carry tenant_id, so
-- scripts/apply-database-access.js will apply the standard tenant isolation
-- policy after this migration is deployed.

-- CreateTable
CREATE TABLE "action"."DurableWorkflowInstance" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "workflow_type" TEXT NOT NULL DEFAULT 'CONTAINMENT_ESCALATION',
    "incident_ref" TEXT NOT NULL,
    "target_resource" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "current_tier" TEXT NOT NULL,
    "current_state" TEXT NOT NULL,
    "mfa_challenge_verified" BOOLEAN NOT NULL DEFAULT false,
    "action_receipt_id" TEXT,
    "rollback_receipt_id" TEXT,
    "attestation_digest" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DurableWorkflowInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action"."DurableWorkflowTransition" (
    "id" TEXT NOT NULL,
    "workflow_instance_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "recorded_by" TEXT,
    "metadata_reference" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DurableWorkflowTransition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DurableWorkflowInstance_workflow_id_key"
    ON "action"."DurableWorkflowInstance"("workflow_id");

-- CreateIndex
CREATE INDEX "DurableWorkflowInstance_tenant_id_idx"
    ON "action"."DurableWorkflowInstance"("tenant_id");

-- CreateIndex
CREATE INDEX "DurableWorkflowTransition_workflow_instance_id_idx"
    ON "action"."DurableWorkflowTransition"("workflow_instance_id");

-- CreateIndex
CREATE INDEX "DurableWorkflowTransition_tenant_id_idx"
    ON "action"."DurableWorkflowTransition"("tenant_id");

-- AddForeignKey
ALTER TABLE "action"."DurableWorkflowTransition"
    ADD CONSTRAINT "DurableWorkflowTransition_workflow_instance_id_fkey"
    FOREIGN KEY ("workflow_instance_id")
    REFERENCES "action"."DurableWorkflowInstance"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
