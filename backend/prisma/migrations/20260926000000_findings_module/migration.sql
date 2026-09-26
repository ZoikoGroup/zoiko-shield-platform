-- Exposure findings module (W30, G2).
--
-- Additive only: one new PostgreSQL schema and six new tables. Nothing
-- existing is altered, so this migration is safe to replay onto a
-- populated database.
--
-- Every table carries a NOT NULL tenant_id, which prisma/access/access-policy.js
-- classifies as tenant-isolated automatically; apply-database-access.js then
-- applies row-level security to each of them after deploy.

CREATE SCHEMA IF NOT EXISTS "findings";

-- CreateTable
CREATE TABLE "findings"."Finding" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL DEFAULT 'default-env',
    "asset_id" TEXT,
    "asset_external_ref" TEXT,
    "source_system" TEXT NOT NULL,
    "source_finding_id" TEXT NOT NULL,
    "scanner_version" TEXT,
    "finding_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "vulnerability_ref" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority_score" DOUBLE PRECISION,
    "evaluator_version" TEXT,
    "priority_evaluated_at" TIMESTAMP(3),
    "first_detected_at" TIMESTAMP(3) NOT NULL,
    "last_confirmed_at" TIMESTAMP(3) NOT NULL,
    "reassertion_interval_hours" INTEGER,
    "resolved_at" TIMESTAMP(3),
    "resolution_note" TEXT,
    "detection_confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "findings"."FindingPriorityFactor" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "finding_id" TEXT NOT NULL,
    "factor" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "contribution" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weight" DOUBLE PRECISION,
    "unknown_input" BOOLEAN NOT NULL DEFAULT false,
    "source_ref" TEXT,
    "evaluator_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FindingPriorityFactor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "findings"."FindingAttackPathNode" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "finding_id" TEXT NOT NULL,
    "step_index" INTEGER NOT NULL,
    "node_type" TEXT NOT NULL,
    "node_ref" TEXT NOT NULL,
    "node_label" TEXT,
    "relation" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "inferred" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FindingAttackPathNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "findings"."FindingRemediation" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "finding_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "guidance" TEXT,
    "owner_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "due_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "verification_ref" TEXT,
    "blocked_reason" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FindingRemediation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "findings"."FindingAcceptance" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "finding_id" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "accepted_by" TEXT NOT NULL,
    "authorization_decision_id" TEXT,
    "compensating_controls" TEXT NOT NULL DEFAULT '[]',
    "risk_ref" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "review_at" TIMESTAMP(3),
    "revoked_by" TEXT,
    "revoked_at" TIMESTAMP(3),
    "revoke_reason" TEXT,

    CONSTRAINT "FindingAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "findings"."FindingEvidence" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "finding_id" TEXT NOT NULL,
    "evidence_ref" TEXT NOT NULL,
    "collector" TEXT NOT NULL,
    "collector_version" TEXT,
    "collected_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "media_type" TEXT NOT NULL DEFAULT 'application/json',
    "summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FindingEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Finding_tenant_id_idx" ON "findings"."Finding"("tenant_id");

-- CreateIndex
CREATE INDEX "Finding_tenant_id_status_idx" ON "findings"."Finding"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "Finding_tenant_id_severity_idx" ON "findings"."Finding"("tenant_id", "severity");

-- CreateIndex
CREATE INDEX "Finding_asset_id_idx" ON "findings"."Finding"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "Finding_tenant_id_source_system_source_finding_id_key" ON "findings"."Finding"("tenant_id", "source_system", "source_finding_id");

-- CreateIndex
CREATE INDEX "FindingPriorityFactor_tenant_id_idx" ON "findings"."FindingPriorityFactor"("tenant_id");

-- CreateIndex
CREATE INDEX "FindingPriorityFactor_finding_id_idx" ON "findings"."FindingPriorityFactor"("finding_id");

-- CreateIndex
CREATE INDEX "FindingAttackPathNode_tenant_id_idx" ON "findings"."FindingAttackPathNode"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "FindingAttackPathNode_finding_id_step_index_key" ON "findings"."FindingAttackPathNode"("finding_id", "step_index");

-- CreateIndex
CREATE INDEX "FindingRemediation_tenant_id_idx" ON "findings"."FindingRemediation"("tenant_id");

-- CreateIndex
CREATE INDEX "FindingRemediation_finding_id_idx" ON "findings"."FindingRemediation"("finding_id");

-- CreateIndex
CREATE UNIQUE INDEX "FindingAcceptance_finding_id_key" ON "findings"."FindingAcceptance"("finding_id");

-- CreateIndex
CREATE INDEX "FindingAcceptance_tenant_id_idx" ON "findings"."FindingAcceptance"("tenant_id");

-- CreateIndex
CREATE INDEX "FindingAcceptance_tenant_id_status_idx" ON "findings"."FindingAcceptance"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "FindingEvidence_tenant_id_idx" ON "findings"."FindingEvidence"("tenant_id");

-- CreateIndex
CREATE INDEX "FindingEvidence_finding_id_idx" ON "findings"."FindingEvidence"("finding_id");


-- AddForeignKey
ALTER TABLE "findings"."FindingPriorityFactor" ADD CONSTRAINT "FindingPriorityFactor_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "findings"."Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings"."FindingAttackPathNode" ADD CONSTRAINT "FindingAttackPathNode_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "findings"."Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings"."FindingRemediation" ADD CONSTRAINT "FindingRemediation_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "findings"."Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings"."FindingAcceptance" ADD CONSTRAINT "FindingAcceptance_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "findings"."Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings"."FindingEvidence" ADD CONSTRAINT "FindingEvidence_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "findings"."Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

