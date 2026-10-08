-- ZS-CSPM-001. PostureDriftDetectorService previously held every scan result
-- and remediation receipt in an in-process Map, which loses state on
-- restart and is invisible across replicas (a scan handled by one pod,
-- remediated against another, "finding not found"). Additive only: one new
-- table in the existing "continuous_assurance" schema.
--
-- Ordinary tenant row-level security from apply-database-access.js, per the
-- tenant classification in prisma/access/access-policy.js - every finding
-- belongs to exactly one tenant's own cloud assets, no shared baseline.

CREATE TABLE "continuous_assurance"."posture_drift_findings" (
    "id" TEXT NOT NULL,
    "tenantId" UUID NOT NULL,
    "assetId" VARCHAR(255) NOT NULL,
    "assetType" VARCHAR(100) NOT NULL,
    "cloudProvider" VARCHAR(50) NOT NULL,
    "ruleCode" VARCHAR(100) NOT NULL,
    "ruleTitle" VARCHAR(255) NOT NULL,
    "severity" VARCHAR(20) NOT NULL,
    "description" TEXT NOT NULL,
    "complianceImpact" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "detectedAt" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(40) NOT NULL DEFAULT 'OPEN',
    "remediationPlan" JSONB NOT NULL,
    "remediationReceipt" JSONB,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "posture_drift_findings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "posture_drift_findings_tenantId_idx"
  ON "continuous_assurance"."posture_drift_findings"("tenantId");

CREATE INDEX "posture_drift_findings_tenantId_status_idx"
  ON "continuous_assurance"."posture_drift_findings"("tenantId", "status");
