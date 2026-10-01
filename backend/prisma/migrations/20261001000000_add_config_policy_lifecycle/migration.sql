-- W12 (Spec §619: "Draft/diff, scope, impact, approvers, test/simulation,
-- staged deployment, effective version, rollback and audit record").
-- PolicyLifecycleService previously held this in an in-process Map, which
-- loses every approval and rollback decision on restart and would diverge
-- across replicas. Additive only: two new tables in the existing
-- "authorization" schema; nothing existing is altered.
--
-- Unlike the rest of "authorization" (control_plane, no RLS - see that
-- schema file's header), these two tables carry a real tenant_id and get
-- ordinary tenant row-level security from apply-database-access.js, per the
-- tenant_or_shared / tenant classification in prisma/access/access-policy.js.

CREATE TABLE "authorization"."config_policy_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID,
    "policyKey" VARCHAR(150) NOT NULL,
    "policyName" VARCHAR(255) NOT NULL,
    "domain" VARCHAR(40) NOT NULL,
    "version" VARCHAR(40) NOT NULL,
    "status" VARCHAR(40) NOT NULL DEFAULT 'PENDING_APPROVAL',
    "stagedEnvironment" VARCHAR(100),
    "canaryPercentage" INTEGER NOT NULL DEFAULT 0,
    "author" VARCHAR(255) NOT NULL,
    "approvers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "commitHash" VARCHAR(64) NOT NULL,
    "diffSummary" TEXT NOT NULL,
    "diffPrevious" TEXT NOT NULL,
    "diffProposed" TEXT NOT NULL,
    "reversalReason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "config_policy_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "config_policy_versions_tenantId_policyKey_key"
  ON "authorization"."config_policy_versions"("tenantId", "policyKey");

CREATE INDEX "config_policy_versions_tenantId_idx"
  ON "authorization"."config_policy_versions"("tenantId");

CREATE TABLE "authorization"."config_policy_audit_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "policyVersionId" UUID NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "actorId" VARCHAR(255) NOT NULL,
    "detail" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "config_policy_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "config_policy_audit_events_tenantId_idx"
  ON "authorization"."config_policy_audit_events"("tenantId");

CREATE INDEX "config_policy_audit_events_policyVersionId_idx"
  ON "authorization"."config_policy_audit_events"("policyVersionId");

ALTER TABLE "authorization"."config_policy_audit_events"
  ADD CONSTRAINT "config_policy_audit_events_policyVersionId_fkey"
  FOREIGN KEY ("policyVersionId") REFERENCES "authorization"."config_policy_versions"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;
