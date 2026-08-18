ALTER TABLE "AuthorizationDecision"
  ADD COLUMN IF NOT EXISTS "environment_id" TEXT,
  ADD COLUMN IF NOT EXISTS "effect_class" TEXT NOT NULL DEFAULT 'READ',
  ADD COLUMN IF NOT EXISTS "resource_tenant_id" TEXT,
  ADD COLUMN IF NOT EXISTS "purpose" TEXT NOT NULL DEFAULT 'interactive-api',
  ADD COLUMN IF NOT EXISTS "required_permissions" TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "required_entitlement" TEXT,
  ADD COLUMN IF NOT EXISTS "reason_code" TEXT NOT NULL DEFAULT 'UNSPECIFIED',
  ADD COLUMN IF NOT EXISTS "obligations" TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "context_hash" TEXT;

UPDATE "AuthorizationDecision"
SET "decision" = 'PERMIT'
WHERE "decision" = 'ALLOW';

CREATE INDEX IF NOT EXISTS "AuthorizationDecision_decision_idx"
  ON "AuthorizationDecision"("decision");

CREATE INDEX IF NOT EXISTS "AuthorizationDecision_correlation_id_idx"
  ON "AuthorizationDecision"("correlation_id");
