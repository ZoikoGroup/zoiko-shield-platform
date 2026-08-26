-- Category H batch 2: explicit human authority over protected decisions and
-- append-only deterministic continuity receipts for no-LLM operation.
-- This migration is intentionally generated but not auto-applied.

CREATE TABLE "AiHumanAuthorityDecision" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "action_class" TEXT NOT NULL,
  "resource_type" TEXT NOT NULL,
  "resource_id" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "decision_origin" TEXT NOT NULL,
  "ai_output_id" TEXT,
  "ai_human_review_id" TEXT,
  "human_confirmation" BOOLEAN NOT NULL DEFAULT false,
  "authority_statement" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "authorization_context" TEXT NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiHumanAuthorityDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiHumanAuthorityDecision_action_check" CHECK (
    "action_class" IN (
      'REFUND_AUTHORIZATION',
      'COMMERCIAL_CHANGE_AUTHORIZATION',
      'CONTRACT_CHANGE_AUTHORIZATION',
      'RESPONSE_AUTHORITY_ELEVATION',
      'HIGH_IMPACT_RESPONSE_AUTHORIZATION',
      'COMPLIANCE_CONCLUSION',
      'LEGAL_COMPLIANCE_CONCLUSION'
    )
  ),
  CONSTRAINT "AiHumanAuthorityDecision_origin_check" CHECK (
    "decision_origin" IN ('HUMAN', 'AI_ASSISTED', 'AI_AUTONOMOUS', 'MISSING')
  ),
  CONSTRAINT "AiHumanAuthorityDecision_decision_check" CHECK (
    "decision" IN ('PERMIT', 'DENY')
  ),
  CONSTRAINT "AiHumanAuthorityDecision_permit_check" CHECK (
    "decision" <> 'PERMIT' OR (
      "human_confirmation" AND
      LENGTH(BTRIM("authority_statement")) >= 12 AND
      "decision_origin" IN ('HUMAN', 'AI_ASSISTED')
    )
  ),
  CONSTRAINT "AiHumanAuthorityDecision_reference_check" CHECK (
    "decision" <> 'PERMIT' OR
    ("decision_origin" = 'HUMAN' AND "ai_output_id" IS NULL AND "ai_human_review_id" IS NULL) OR
    ("decision_origin" = 'AI_ASSISTED' AND "ai_output_id" IS NOT NULL AND "ai_human_review_id" IS NOT NULL)
  ),
  CONSTRAINT "AiHumanAuthorityDecision_context_json_check" CHECK (
    jsonb_typeof("authorization_context"::jsonb) = 'object'
  )
);

CREATE INDEX "AiHumanAuthorityDecision_tenant_id_environment_id_created_a_idx"
  ON "AiHumanAuthorityDecision"("tenant_id", "environment_id", "created_at");
CREATE INDEX "AiHumanAuthorityDecision_action_class_resource_type_resourc_idx"
  ON "AiHumanAuthorityDecision"("action_class", "resource_type", "resource_id");
CREATE INDEX "AiHumanAuthorityDecision_actor_id_created_at_idx"
  ON "AiHumanAuthorityDecision"("actor_id", "created_at");
CREATE INDEX "AiHumanAuthorityDecision_ai_output_id_idx"
  ON "AiHumanAuthorityDecision"("ai_output_id");

ALTER TABLE "AiHumanAuthorityDecision"
  ADD CONSTRAINT "AiHumanAuthorityDecision_ai_output_id_fkey"
  FOREIGN KEY ("ai_output_id") REFERENCES "AiOutput"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiHumanAuthorityDecision"
  ADD CONSTRAINT "AiHumanAuthorityDecision_ai_human_review_id_fkey"
  FOREIGN KEY ("ai_human_review_id") REFERENCES "AiHumanReview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DeterministicContinuityEvent" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "engine" TEXT NOT NULL DEFAULT 'SHIELD_CORE_DETERMINISTIC_V1',
  "llm_used" BOOLEAN NOT NULL DEFAULT false,
  "input_hash" TEXT NOT NULL,
  "output_hash" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "authorization_ref" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeterministicContinuityEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeterministicContinuityEvent_operation_check" CHECK (
    "operation" IN (
      'DETECTION_EVALUATION',
      'EVIDENCE_INTEGRITY',
      'AUTHORIZATION',
      'RESPONSE_SAFETY',
      'CORE_CASE_FALLBACK'
    )
  ),
  CONSTRAINT "DeterministicContinuityEvent_engine_check" CHECK (
    "engine" = 'SHIELD_CORE_DETERMINISTIC_V1' AND NOT "llm_used"
  ),
  CONSTRAINT "DeterministicContinuityEvent_hash_check" CHECK (
    "input_hash" ~ '^[0-9a-f]{64}$' AND "output_hash" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "DeterministicContinuityEvent_outcome_check" CHECK (
    NULLIF(BTRIM("outcome"), '') IS NOT NULL AND NULLIF(BTRIM("reason"), '') IS NOT NULL
  )
);

CREATE INDEX "DeterministicContinuityEvent_tenant_id_environment_id_creat_idx"
  ON "DeterministicContinuityEvent"("tenant_id", "environment_id", "created_at");
CREATE INDEX "DeterministicContinuityEvent_operation_outcome_created_at_idx"
  ON "DeterministicContinuityEvent"("operation", "outcome", "created_at");

CREATE FUNCTION "enforce_ai_human_authority_boundary"() RETURNS trigger AS $$
BEGIN
  IF NEW."decision" = 'PERMIT' AND NEW."decision_origin" = 'AI_ASSISTED' THEN
    PERFORM 1
    FROM "AiOutput" output
    JOIN "AiHumanReview" review
      ON review."id" = NEW."ai_human_review_id"
     AND review."ai_output_id" = output."id"
     AND review."tenant_id" = NEW."tenant_id"
     AND review."decision" IN ('APPROVED', 'MODIFIED')
    WHERE output."id" = NEW."ai_output_id"
      AND output."tenant_id" = NEW."tenant_id"
      AND output."environment_id" = NEW."environment_id"
      AND output."safety_result" IN ('PASS', 'PASSED', 'SAFE', 'DEGRADED');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'AI-assisted protected decisions require matching tenant-bound safe output and approved human review';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AiHumanAuthorityDecision_boundary_guard"
  BEFORE INSERT ON "AiHumanAuthorityDecision"
  FOR EACH ROW EXECUTE FUNCTION "enforce_ai_human_authority_boundary"();

CREATE FUNCTION "reject_category_h_authority_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AI human-review, human-authority and deterministic-continuity receipts are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AiHumanReview_no_update"
  BEFORE UPDATE ON "AiHumanReview"
  FOR EACH ROW EXECUTE FUNCTION "reject_category_h_authority_mutation"();
CREATE TRIGGER "AiHumanReview_no_delete"
  BEFORE DELETE ON "AiHumanReview"
  FOR EACH ROW EXECUTE FUNCTION "reject_category_h_authority_mutation"();
CREATE TRIGGER "AiHumanAuthorityDecision_no_update"
  BEFORE UPDATE ON "AiHumanAuthorityDecision"
  FOR EACH ROW EXECUTE FUNCTION "reject_category_h_authority_mutation"();
CREATE TRIGGER "AiHumanAuthorityDecision_no_delete"
  BEFORE DELETE ON "AiHumanAuthorityDecision"
  FOR EACH ROW EXECUTE FUNCTION "reject_category_h_authority_mutation"();
CREATE TRIGGER "DeterministicContinuityEvent_no_update"
  BEFORE UPDATE ON "DeterministicContinuityEvent"
  FOR EACH ROW EXECUTE FUNCTION "reject_category_h_authority_mutation"();
CREATE TRIGGER "DeterministicContinuityEvent_no_delete"
  BEFORE DELETE ON "DeterministicContinuityEvent"
  FOR EACH ROW EXECUTE FUNCTION "reject_category_h_authority_mutation"();
