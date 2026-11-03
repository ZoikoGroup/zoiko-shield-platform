-- Dual-custody quorum persistence (ADR-04).
--
-- Replaces the in-process Map in DualCustodyQuorumService, which lost every
-- pending second signature on restart and could not be shared between
-- shield-action instances. The table lives in the action schema and carries a
-- NOT NULL tenant_id, so scripts/apply-database-access.js applies the
-- standard tenant isolation policy after this migration is deployed.

-- CreateTable
CREATE TABLE "action"."DualCustodyQuorum" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "quorum_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "target_resource" TEXT NOT NULL,
    "authority_level" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "initiator" TEXT NOT NULL,
    "secondary_approver" TEXT,
    "quorum_signature" TEXT,
    "single_use_rollback_token" TEXT NOT NULL,
    "compensating_plan" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "finalized_at" TIMESTAMP(3),
    "consumed_at" TIMESTAMP(3),

    CONSTRAINT "DualCustodyQuorum_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DualCustodyQuorum_single_use_rollback_token_key"
    ON "action"."DualCustodyQuorum"("single_use_rollback_token");

-- CreateIndex
CREATE UNIQUE INDEX "DualCustodyQuorum_tenant_id_quorum_id_key"
    ON "action"."DualCustodyQuorum"("tenant_id", "quorum_id");

-- CreateIndex
CREATE INDEX "DualCustodyQuorum_tenant_id_proposal_id_idx"
    ON "action"."DualCustodyQuorum"("tenant_id", "proposal_id");
