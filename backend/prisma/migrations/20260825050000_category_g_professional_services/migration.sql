-- Category G batch 2: governed vCISO, assessment/tabletop, penetration-test,
-- audit/evidence and general professional-service engagements.
-- This migration is intentionally generated but not auto-applied.

CREATE TABLE "ProfessionalServiceEngagement" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "commercial_account_id" TEXT NOT NULL,
  "contract_id" TEXT NOT NULL,
  "service_obligation_id" TEXT NOT NULL,
  "engagement_key" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "service_type" TEXT NOT NULL,
  "sow_reference" TEXT NOT NULL,
  "price_book_id" TEXT NOT NULL,
  "term_start" TIMESTAMP(3) NOT NULL,
  "term_end" TIMESTAMP(3) NOT NULL,
  "scheduled_service_at" TIMESTAMP(3),
  "scope" TEXT NOT NULL DEFAULT '{}',
  "required_inputs" TEXT NOT NULL DEFAULT '[]',
  "customer_responsibilities" TEXT NOT NULL DEFAULT '[]',
  "provider_responsibilities" TEXT NOT NULL DEFAULT '[]',
  "deliverable_definitions" TEXT NOT NULL DEFAULT '[]',
  "acceptance_criteria" TEXT NOT NULL DEFAULT '[]',
  "correction_retest_policy" TEXT NOT NULL DEFAULT '{}',
  "pricing_mode" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "contracted_amount" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "allocation_period" TEXT NOT NULL DEFAULT 'PROJECT',
  "included_hours" DECIMAL(8,2) NOT NULL,
  "hourly_rate" DECIMAL(14,4),
  "consumed_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "overage_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "forecast_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "warning_threshold_percent" INTEGER NOT NULL DEFAULT 80,
  "threshold_state" TEXT NOT NULL DEFAULT 'WITHIN_ALLOWANCE',
  "overage_policy" TEXT NOT NULL DEFAULT 'REQUIRE_APPROVAL',
  "overage_cap_hours" DECIMAL(8,2),
  "rollover_policy" TEXT NOT NULL DEFAULT 'NONE',
  "rollover_cap_hours" DECIMAL(8,2),
  "hours_expire_at" TIMESTAMP(3) NOT NULL,
  "meeting_cadence" TEXT,
  "review_cadence" TEXT,
  "pen_test_authorization" TEXT NOT NULL DEFAULT '{}',
  "rules_of_engagement" TEXT NOT NULL DEFAULT '{}',
  "tester_assurance" TEXT NOT NULL DEFAULT '{}',
  "report_treatment" TEXT NOT NULL DEFAULT '{}',
  "framework_key" TEXT,
  "framework_version" TEXT,
  "source_data_responsibilities" TEXT NOT NULL DEFAULT '{}',
  "limitations" TEXT NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  "approval_id" TEXT,
  "requested_by" TEXT NOT NULL,
  "approved_by" TEXT,
  "approved_at" TIMESTAMP(3),
  "activated_by" TEXT,
  "activation_reference" TEXT,
  "readiness_evidence_refs" TEXT NOT NULL DEFAULT '[]',
  "activated_at" TIMESTAMP(3),
  "accepted_by_customer" TEXT,
  "customer_acceptance_reference" TEXT,
  "accepted_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProfessionalServiceEngagement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProfessionalServiceEngagement_type_check" CHECK (
    "service_type" IN (
      'VCISO', 'ASSESSMENT', 'TABLETOP', 'PENETRATION_TEST',
      'AUDIT_EVIDENCE_PROJECT', 'GENERAL_PROFESSIONAL_SERVICE'
    )
  ),
  CONSTRAINT "ProfessionalServiceEngagement_term_check" CHECK (
    "term_end" > "term_start" AND
    "hours_expire_at" >= "term_start" AND "hours_expire_at" <= "term_end" AND
    ("scheduled_service_at" IS NULL OR
      "scheduled_service_at" BETWEEN "term_start" AND "term_end")
  ),
  CONSTRAINT "ProfessionalServiceEngagement_scope_check" CHECK (
    jsonb_typeof("scope"::jsonb) = 'object' AND "scope"::jsonb ? 'objectives' AND
    "scope"::jsonb ? 'inScope' AND "scope"::jsonb ? 'outOfScope' AND
    jsonb_typeof("required_inputs"::jsonb) = 'array' AND
    jsonb_array_length("required_inputs"::jsonb) > 0 AND
    jsonb_typeof("customer_responsibilities"::jsonb) = 'array' AND
    jsonb_array_length("customer_responsibilities"::jsonb) > 0 AND
    jsonb_typeof("provider_responsibilities"::jsonb) = 'array' AND
    jsonb_array_length("provider_responsibilities"::jsonb) > 0 AND
    jsonb_typeof("deliverable_definitions"::jsonb) = 'array' AND
    jsonb_array_length("deliverable_definitions"::jsonb) > 0 AND
    jsonb_typeof("acceptance_criteria"::jsonb) = 'array' AND
    jsonb_array_length("acceptance_criteria"::jsonb) > 0 AND
    jsonb_typeof("correction_retest_policy"::jsonb) = 'object' AND
    ("correction_retest_policy"::jsonb->>'allowCorrections')::boolean IS NOT NULL AND
    ("correction_retest_policy"::jsonb->>'retestRequiredOnFailure')::boolean IS NOT NULL AND
    ("correction_retest_policy"::jsonb->>'maxRounds')::integer BETWEEN 1 AND 5
  ),
  CONSTRAINT "ProfessionalServiceEngagement_pricing_check" CHECK (
    "pricing_mode" IN ('FIXED_FEE', 'HOUR_BANK', 'RETAINED', 'TIME_AND_MATERIALS') AND
    "contracted_amount" >= 0 AND "included_hours" > 0 AND
    ("hourly_rate" IS NULL OR "hourly_rate" >= 0) AND
    "consumed_hours" >= 0 AND "overage_hours" >= 0 AND "forecast_hours" >= 0 AND
    "warning_threshold_percent" BETWEEN 1 AND 100 AND
    "threshold_state" IN ('WITHIN_ALLOWANCE', 'WARNING', 'OVERAGE')
  ),
  CONSTRAINT "ProfessionalServiceEngagement_overage_check" CHECK (
    "overage_policy" IN ('BLOCK', 'REQUIRE_APPROVAL', 'ALLOW_CAPPED', 'TRACK_ONLY') AND
    ("overage_policy" <> 'ALLOW_CAPPED' OR "overage_cap_hours" > 0) AND
    ("overage_policy" NOT IN ('BLOCK', 'TRACK_ONLY') OR "overage_cap_hours" IS NULL) AND
    ("pricing_mode" <> 'FIXED_FEE' OR "overage_policy" = 'TRACK_ONLY')
  ),
  CONSTRAINT "ProfessionalServiceEngagement_allocation_check" CHECK (
    "allocation_period" IN ('PROJECT', 'MONTHLY', 'QUARTERLY') AND
    "rollover_policy" IN ('NONE', 'CAPPED', 'FULL') AND
    ("rollover_policy" <> 'CAPPED' OR "rollover_cap_hours" > 0) AND
    ("rollover_policy" <> 'NONE' OR "rollover_cap_hours" IS NULL) AND
    ("allocation_period" <> 'PROJECT' OR "rollover_policy" = 'NONE')
  ),
  CONSTRAINT "ProfessionalServiceEngagement_status_check" CHECK (
    "status" IN (
      'PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'AWAITING_ACCEPTANCE',
      'CORRECTION_REQUIRED', 'ACCEPTED', 'REJECTED', 'CANCELLED'
    )
  ),
  CONSTRAINT "ProfessionalServiceEngagement_approval_check" CHECK (
    "status" NOT IN ('APPROVED', 'ACTIVE', 'AWAITING_ACCEPTANCE', 'CORRECTION_REQUIRED', 'ACCEPTED') OR
    ("approval_id" IS NOT NULL AND NULLIF(BTRIM("approved_by"), '') IS NOT NULL AND "approved_at" IS NOT NULL)
  ),
  CONSTRAINT "ProfessionalServiceEngagement_activation_check" CHECK (
    "status" NOT IN ('ACTIVE', 'AWAITING_ACCEPTANCE', 'CORRECTION_REQUIRED', 'ACCEPTED') OR
    (NULLIF(BTRIM("activated_by"), '') IS NOT NULL AND
     NULLIF(BTRIM("activation_reference"), '') IS NOT NULL AND
     "readiness_evidence_refs" <> '[]' AND "activated_at" IS NOT NULL)
  ),
  CONSTRAINT "ProfessionalServiceEngagement_acceptance_check" CHECK (
    "status" <> 'ACCEPTED' OR
    (NULLIF(BTRIM("accepted_by_customer"), '') IS NOT NULL AND
     NULLIF(BTRIM("customer_acceptance_reference"), '') IS NOT NULL AND
     "accepted_at" IS NOT NULL AND "completed_at" IS NOT NULL)
  ),
  CONSTRAINT "ProfessionalServiceEngagement_service_specific_check" CHECK (
    ("service_type" <> 'VCISO' OR (
      "pricing_mode" IN ('HOUR_BANK', 'RETAINED') AND
      "allocation_period" IN ('MONTHLY', 'QUARTERLY') AND
      NULLIF(BTRIM("meeting_cadence"), '') IS NOT NULL AND
      NULLIF(BTRIM("review_cadence"), '') IS NOT NULL
    )) AND
    ("service_type" NOT IN ('ASSESSMENT', 'TABLETOP', 'PENETRATION_TEST') OR
      "scheduled_service_at" IS NOT NULL) AND
    ("service_type" <> 'PENETRATION_TEST' OR (
      NULLIF(BTRIM("pen_test_authorization"::jsonb->>'customerAuthorizer'), '') IS NOT NULL AND
      NULLIF(BTRIM("pen_test_authorization"::jsonb->>'authorizationReference'), '') IS NOT NULL AND
      COALESCE(jsonb_array_length("pen_test_authorization"::jsonb->'allowedTargets'), 0) > 0 AND
      NULLIF(BTRIM("rules_of_engagement"::jsonb->>'testWindowStart'), '') IS NOT NULL AND
      NULLIF(BTRIM("rules_of_engagement"::jsonb->>'testWindowEnd'), '') IS NOT NULL AND
      COALESCE(jsonb_array_length("rules_of_engagement"::jsonb->'permittedTechniques'), 0) > 0 AND
      COALESCE(jsonb_array_length("rules_of_engagement"::jsonb->'prohibitedActions'), 0) > 0 AND
      COALESCE(("tester_assurance"::jsonb->>'independent')::boolean, false) = true AND
      COALESCE(jsonb_array_length("tester_assurance"::jsonb->'qualificationReferences'), 0) > 0 AND
      NULLIF(BTRIM("report_treatment"::jsonb->>'classification'), '') IS NOT NULL AND
      NULLIF(BTRIM("report_treatment"::jsonb->>'retentionPolicyReference'), '') IS NOT NULL
    )) AND
    ("service_type" <> 'AUDIT_EVIDENCE_PROJECT' OR (
      NULLIF(BTRIM("framework_key"), '') IS NOT NULL AND
      NULLIF(BTRIM("framework_version"), '') IS NOT NULL AND
      COALESCE(jsonb_array_length("source_data_responsibilities"::jsonb->'customer'), 0) > 0 AND
      COALESCE(jsonb_array_length("source_data_responsibilities"::jsonb->'provider'), 0) > 0 AND
      COALESCE(jsonb_array_length("limitations"::jsonb), 0) > 0
    ))
  )
);

CREATE UNIQUE INDEX "ProfessionalServiceEngagement_service_obligation_id_key"
  ON "ProfessionalServiceEngagement"("service_obligation_id");
CREATE UNIQUE INDEX "ProfessionalServiceEngagement_approval_id_key"
  ON "ProfessionalServiceEngagement"("approval_id");
CREATE UNIQUE INDEX "ProfessionalServiceEngagement_tenant_id_environment_id_enga_key"
  ON "ProfessionalServiceEngagement"("tenant_id", "environment_id", "engagement_key", "version");
CREATE INDEX "ProfessionalServiceEngagement_tenant_id_environment_id_stat_idx"
  ON "ProfessionalServiceEngagement"("tenant_id", "environment_id", "status");
CREATE INDEX "ProfessionalServiceEngagement_commercial_account_id_status_idx"
  ON "ProfessionalServiceEngagement"("commercial_account_id", "status");
CREATE INDEX "ProfessionalServiceEngagement_contract_id_status_idx"
  ON "ProfessionalServiceEngagement"("contract_id", "status");
CREATE INDEX "ProfessionalServiceEngagement_service_type_status_idx"
  ON "ProfessionalServiceEngagement"("service_type", "status");
CREATE INDEX "ProfessionalServiceEngagement_term_start_term_end_status_idx"
  ON "ProfessionalServiceEngagement"("term_start", "term_end", "status");

ALTER TABLE "ProfessionalServiceEngagement"
  ADD CONSTRAINT "ProfessionalServiceEngagement_commercial_account_id_fkey"
  FOREIGN KEY ("commercial_account_id") REFERENCES "CommercialAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProfessionalServiceEngagement"
  ADD CONSTRAINT "ProfessionalServiceEngagement_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "Contract"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProfessionalServiceEngagement"
  ADD CONSTRAINT "ProfessionalServiceEngagement_service_obligation_id_fkey"
  FOREIGN KEY ("service_obligation_id") REFERENCES "ServiceObligation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProfessionalServiceEngagement"
  ADD CONSTRAINT "ProfessionalServiceEngagement_price_book_id_fkey"
  FOREIGN KEY ("price_book_id") REFERENCES "PriceBook"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ProfessionalServiceActivity" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "engagement_id" TEXT NOT NULL,
  "activity_type" TEXT NOT NULL,
  "entry_type" TEXT NOT NULL DEFAULT 'STANDARD',
  "hours" DECIMAL(8,2) NOT NULL,
  "allocation_period_start" TIMESTAMP(3) NOT NULL,
  "allocation_period_end" TIMESTAMP(3) NOT NULL,
  "included_available_after" DECIMAL(8,2) NOT NULL,
  "consumed_period_after" DECIMAL(8,2) NOT NULL,
  "overage_period_after" DECIMAL(8,2) NOT NULL,
  "forecast_period_after" DECIMAL(8,2) NOT NULL,
  "total_engagement_after" DECIMAL(8,2) NOT NULL,
  "threshold_state" TEXT NOT NULL,
  "overage_approval_id" TEXT,
  "summary" TEXT NOT NULL,
  "evidence_reference" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfessionalServiceActivity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProfessionalServiceActivity_values_check" CHECK (
    "hours" > 0 AND "allocation_period_end" > "allocation_period_start" AND
    "included_available_after" > 0 AND "consumed_period_after" > 0 AND
    "overage_period_after" >= 0 AND "forecast_period_after" >= 0 AND
    "total_engagement_after" > 0
  ),
  CONSTRAINT "ProfessionalServiceActivity_type_check" CHECK (
    "activity_type" IN (
      'DELIVERY_WORK', 'MEETING', 'REVIEW', 'WORKSHOP',
      'TEST_EXECUTION', 'RETEST', 'CORRECTION'
    ) AND
    "entry_type" IN (
      'STANDARD', 'PREAUTHORIZED_OVERAGE', 'APPROVED_OVERAGE', 'INTERNAL_VARIANCE'
    ) AND
    ("entry_type" <> 'APPROVED_OVERAGE' OR "overage_approval_id" IS NOT NULL)
  ),
  CONSTRAINT "ProfessionalServiceActivity_threshold_check" CHECK (
    "threshold_state" IN ('WITHIN_ALLOWANCE', 'WARNING', 'OVERAGE')
  ),
  CONSTRAINT "ProfessionalServiceActivity_evidence_check" CHECK (
    NULLIF(BTRIM("summary"), '') IS NOT NULL AND
    NULLIF(BTRIM("evidence_reference"), '') IS NOT NULL AND
    NULLIF(BTRIM("actor_id"), '') IS NOT NULL
  )
);
CREATE INDEX "ProfessionalServiceActivity_tenant_id_environment_id_occurr_idx"
  ON "ProfessionalServiceActivity"("tenant_id", "environment_id", "occurred_at");
CREATE INDEX "ProfessionalServiceActivity_engagement_id_allocation_period_idx"
  ON "ProfessionalServiceActivity"("engagement_id", "allocation_period_start", "occurred_at");
CREATE INDEX "ProfessionalServiceActivity_entry_type_idx"
  ON "ProfessionalServiceActivity"("entry_type");
ALTER TABLE "ProfessionalServiceActivity"
  ADD CONSTRAINT "ProfessionalServiceActivity_engagement_id_fkey"
  FOREIGN KEY ("engagement_id") REFERENCES "ProfessionalServiceEngagement"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ProfessionalServiceDeliverable" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "engagement_id" TEXT NOT NULL,
  "deliverable_key" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "content_reference" TEXT NOT NULL,
  "evidence_references" TEXT NOT NULL DEFAULT '[]',
  "limitations" TEXT NOT NULL DEFAULT '[]',
  "correction_of_id" TEXT,
  "retest_reference" TEXT,
  "submitted_by" TEXT NOT NULL,
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfessionalServiceDeliverable_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProfessionalServiceDeliverable_values_check" CHECK (
    "version" > 0 AND NULLIF(BTRIM("deliverable_key"), '') IS NOT NULL AND
    NULLIF(BTRIM("title"), '') IS NOT NULL AND
    NULLIF(BTRIM("content_reference"), '') IS NOT NULL AND
    "evidence_references" <> '[]' AND NULLIF(BTRIM("submitted_by"), '') IS NOT NULL
  )
);
CREATE UNIQUE INDEX "ProfessionalServiceDeliverable_engagement_id_deliverable_ke_key"
  ON "ProfessionalServiceDeliverable"("engagement_id", "deliverable_key", "version");
CREATE INDEX "ProfessionalServiceDeliverable_tenant_id_environment_id_sub_idx"
  ON "ProfessionalServiceDeliverable"("tenant_id", "environment_id", "submitted_at");
CREATE INDEX "ProfessionalServiceDeliverable_engagement_id_submitted_at_idx"
  ON "ProfessionalServiceDeliverable"("engagement_id", "submitted_at");
CREATE INDEX "ProfessionalServiceDeliverable_correction_of_id_idx"
  ON "ProfessionalServiceDeliverable"("correction_of_id");
ALTER TABLE "ProfessionalServiceDeliverable"
  ADD CONSTRAINT "ProfessionalServiceDeliverable_engagement_id_fkey"
  FOREIGN KEY ("engagement_id") REFERENCES "ProfessionalServiceEngagement"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProfessionalServiceDeliverable"
  ADD CONSTRAINT "ProfessionalServiceDeliverable_correction_of_id_fkey"
  FOREIGN KEY ("correction_of_id") REFERENCES "ProfessionalServiceDeliverable"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ProfessionalServiceAcceptanceEvent" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "engagement_id" TEXT NOT NULL,
  "round" INTEGER NOT NULL,
  "decision" TEXT NOT NULL,
  "reviewed_deliverable_ids" TEXT NOT NULL DEFAULT '[]',
  "criteria_results" TEXT NOT NULL DEFAULT '{}',
  "named_customer_authorizer" TEXT NOT NULL,
  "customer_decision_reference" TEXT NOT NULL,
  "correction_scope" TEXT,
  "retest_required" BOOLEAN NOT NULL DEFAULT false,
  "decided_by" TEXT NOT NULL,
  "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfessionalServiceAcceptanceEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProfessionalServiceAcceptanceEvent_values_check" CHECK (
    "round" > 0 AND "decision" IN ('ACCEPTED', 'CORRECTION_REQUIRED') AND
    "reviewed_deliverable_ids" <> '[]' AND "criteria_results" <> '{}' AND
    NULLIF(BTRIM("named_customer_authorizer"), '') IS NOT NULL AND
    NULLIF(BTRIM("customer_decision_reference"), '') IS NOT NULL AND
    NULLIF(BTRIM("decided_by"), '') IS NOT NULL AND
    ("decision" <> 'CORRECTION_REQUIRED' OR
      NULLIF(BTRIM("correction_scope"), '') IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "ProfessionalServiceAcceptanceEvent_engagement_id_round_key"
  ON "ProfessionalServiceAcceptanceEvent"("engagement_id", "round");
CREATE INDEX "ProfessionalServiceAcceptanceEvent_tenant_id_environment_id_idx"
  ON "ProfessionalServiceAcceptanceEvent"("tenant_id", "environment_id", "decided_at");
CREATE INDEX "ProfessionalServiceAcceptanceEvent_engagement_id_decided_at_idx"
  ON "ProfessionalServiceAcceptanceEvent"("engagement_id", "decided_at");
CREATE INDEX "ProfessionalServiceAcceptanceEvent_decision_idx"
  ON "ProfessionalServiceAcceptanceEvent"("decision");
ALTER TABLE "ProfessionalServiceAcceptanceEvent"
  ADD CONSTRAINT "ProfessionalServiceAcceptanceEvent_engagement_id_fkey"
  FOREIGN KEY ("engagement_id") REFERENCES "ProfessionalServiceEngagement"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "enforce_professional_service_boundary"() RETURNS trigger AS $$
DECLARE
  expected_obligation_type TEXT;
BEGIN
  expected_obligation_type := CASE NEW."service_type"
    WHEN 'VCISO' THEN 'VCISO'
    WHEN 'ASSESSMENT' THEN 'ASSESSMENT_PROJECT'
    WHEN 'TABLETOP' THEN 'TABLETOP_PROJECT'
    WHEN 'PENETRATION_TEST' THEN 'PENETRATION_TEST'
    WHEN 'AUDIT_EVIDENCE_PROJECT' THEN 'AUDIT_EVIDENCE_PROJECT'
    ELSE 'PROFESSIONAL_SERVICE'
  END;

  IF TG_OP = 'INSERT' THEN
    PERFORM 1
    FROM "Contract" contract
    JOIN "ServiceObligation" obligation
      ON obligation."id" = NEW."service_obligation_id"
    JOIN "CommercialAccountTenantBinding" binding
      ON binding."commercial_account_id" = NEW."commercial_account_id"
    JOIN "PriceBook" price ON price."id" = NEW."price_book_id"
    JOIN "Product" product ON product."id" = price."product_id"
    WHERE contract."id" = NEW."contract_id"
      AND contract."commercial_account_id" = NEW."commercial_account_id"
      AND contract."status" = 'ACTIVE'
      AND NEW."term_start" >= contract."term_start"
      AND NEW."term_end" <= contract."term_end"
      AND obligation."tenant_id" = NEW."tenant_id"
      AND obligation."environment_id" = NEW."environment_id"
      AND obligation."contract_id" = NEW."contract_id"
      AND obligation."obligation_type" = expected_obligation_type
      AND obligation."status" = 'ACTIVE'
      AND binding."tenant_id" = NEW."tenant_id"
      AND binding."environment_id" = NEW."environment_id"
      AND binding."status" = 'ACTIVE'
      AND binding."effective_from" <= NEW."term_start"
      AND (binding."effective_to" IS NULL OR binding."effective_to" >= NEW."term_end")
      AND price."status" = 'APPROVED'
      AND product."offer_family" = 'PROFESSIONAL_SERVICE'
      AND price."catalog_version_id" = contract."catalog_version_id"
      AND (price."commercial_account_id" IS NULL OR
           price."commercial_account_id" = NEW."commercial_account_id")
      AND price."region" IN ('GLOBAL', binding."region")
      AND price."effective_from" <= NEW."term_start"
      AND (price."effective_to" IS NULL OR price."effective_to" >= NEW."term_end");
    IF NOT FOUND THEN
      RAISE EXCEPTION 'professional service requires matching contract, obligation, tenant binding and approved professional-service price';
    END IF;
  ELSE
    IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id" OR
       NEW."environment_id" IS DISTINCT FROM OLD."environment_id" OR
       NEW."commercial_account_id" IS DISTINCT FROM OLD."commercial_account_id" OR
       NEW."contract_id" IS DISTINCT FROM OLD."contract_id" OR
       NEW."service_obligation_id" IS DISTINCT FROM OLD."service_obligation_id" OR
       NEW."engagement_key" IS DISTINCT FROM OLD."engagement_key" OR
       NEW."version" IS DISTINCT FROM OLD."version" THEN
      RAISE EXCEPTION 'professional-service tenant and contract identity are immutable';
    END IF;
    IF OLD."status" IN ('APPROVED', 'ACTIVE', 'AWAITING_ACCEPTANCE', 'CORRECTION_REQUIRED', 'ACCEPTED') AND
       (to_jsonb(NEW) - ARRAY[
         'status', 'activated_by', 'activation_reference', 'readiness_evidence_refs',
         'activated_at', 'consumed_hours', 'overage_hours', 'forecast_hours',
         'threshold_state', 'accepted_by_customer', 'customer_acceptance_reference',
         'accepted_at', 'completed_at', 'updated_at'
       ]::text[]) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY[
         'status', 'activated_by', 'activation_reference', 'readiness_evidence_refs',
         'activated_at', 'consumed_hours', 'overage_hours', 'forecast_hours',
         'threshold_state', 'accepted_by_customer', 'customer_acceptance_reference',
         'accepted_at', 'completed_at', 'updated_at'
       ]::text[]) THEN
      RAISE EXCEPTION 'approved professional-service SOW and economics are immutable';
    END IF;
    IF OLD."status" IN ('ACTIVE', 'AWAITING_ACCEPTANCE', 'CORRECTION_REQUIRED', 'ACCEPTED') AND (
      NEW."activated_by" IS DISTINCT FROM OLD."activated_by" OR
      NEW."activation_reference" IS DISTINCT FROM OLD."activation_reference" OR
      NEW."readiness_evidence_refs" IS DISTINCT FROM OLD."readiness_evidence_refs" OR
      NEW."activated_at" IS DISTINCT FROM OLD."activated_at"
    ) THEN
      RAISE EXCEPTION 'professional-service activation evidence is immutable';
    END IF;
    IF (NEW."status" <> 'ACCEPTED' OR OLD."status" = 'ACCEPTED') AND (
      NEW."accepted_by_customer" IS DISTINCT FROM OLD."accepted_by_customer" OR
      NEW."customer_acceptance_reference" IS DISTINCT FROM OLD."customer_acceptance_reference" OR
      NEW."accepted_at" IS DISTINCT FROM OLD."accepted_at" OR
      NEW."completed_at" IS DISTINCT FROM OLD."completed_at"
    ) THEN
      RAISE EXCEPTION 'professional-service acceptance evidence may only be set once at acceptance';
    END IF;
  END IF;

  IF NEW."status" = 'APPROVED' THEN
    PERFORM 1 FROM "CommercialApproval" approval
    WHERE approval."id" = NEW."approval_id"
      AND approval."tenant_id" = NEW."tenant_id"
      AND approval."object_type" = 'ProfessionalServiceEngagement'
      AND approval."object_id" = NEW."id"
      AND approval."change_type" = 'PROFESSIONAL_SERVICE_PROFILE'
      AND approval."status" = 'APPROVED';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'approved professional-service profile requires matching approval';
    END IF;
  END IF;

  IF NEW."status" = 'ACTIVE' AND
     (TG_OP = 'INSERT' OR OLD."status" IS DISTINCT FROM 'ACTIVE') THEN
    PERFORM 1 FROM "ServiceObligation" obligation
    WHERE obligation."id" = NEW."service_obligation_id"
      AND obligation."tenant_id" = NEW."tenant_id"
      AND obligation."environment_id" = NEW."environment_id"
      AND obligation."status" = 'ACTIVE'
      AND CURRENT_TIMESTAMP BETWEEN NEW."term_start" AND NEW."term_end";
    IF NOT FOUND THEN
      RAISE EXCEPTION 'professional-service activation requires active obligation and current SOW term';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ProfessionalServiceEngagement_boundary_guard"
  BEFORE INSERT OR UPDATE ON "ProfessionalServiceEngagement"
  FOR EACH ROW EXECUTE FUNCTION "enforce_professional_service_boundary"();

CREATE FUNCTION "enforce_professional_service_activity"() RETURNS trigger AS $$
DECLARE
  engagement_record "ProfessionalServiceEngagement"%ROWTYPE;
BEGIN
  SELECT * INTO engagement_record FROM "ProfessionalServiceEngagement" engagement
  WHERE engagement."id" = NEW."engagement_id"
    AND engagement."tenant_id" = NEW."tenant_id"
    AND engagement."environment_id" = NEW."environment_id"
    AND engagement."status" IN ('ACTIVE', 'CORRECTION_REQUIRED')
    AND NEW."occurred_at" BETWEEN engagement."term_start" AND engagement."term_end"
    AND NEW."occurred_at" <= engagement."hours_expire_at";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'professional-service activity requires matching active tenant/SOW boundary and unexpired hours';
  END IF;

  IF NEW."entry_type" = 'STANDARD' AND NEW."overage_period_after" > 0 THEN
    RAISE EXCEPTION 'standard activity cannot contain overage';
  ELSIF NEW."entry_type" = 'PREAUTHORIZED_OVERAGE' AND
        (engagement_record."overage_policy" <> 'ALLOW_CAPPED' OR
         NEW."overage_period_after" > COALESCE(engagement_record."overage_cap_hours", 0)) THEN
    RAISE EXCEPTION 'preauthorized professional-service overage exceeds contract cap';
  ELSIF NEW."entry_type" = 'INTERNAL_VARIANCE' AND
        engagement_record."overage_policy" <> 'TRACK_ONLY' THEN
    RAISE EXCEPTION 'internal variance is only valid for TRACK_ONLY fixed-fee work';
  ELSIF NEW."entry_type" = 'APPROVED_OVERAGE' THEN
    PERFORM 1 FROM "CommercialApproval" approval
    WHERE approval."id" = NEW."overage_approval_id"
      AND approval."tenant_id" = NEW."tenant_id"
      AND approval."object_type" = 'ProfessionalServiceEngagement'
      AND approval."object_id" = NEW."engagement_id"
      AND approval."change_type" = 'PROFESSIONAL_SERVICE_OVERAGE'
      AND approval."status" = 'APPROVED'
      AND (approval."expires_at" IS NULL OR approval."expires_at" >= CURRENT_TIMESTAMP)
      AND (approval."proposed_snapshot"::jsonb->>'allocationPeriodStart')::timestamptz =
          NEW."allocation_period_start" AT TIME ZONE 'UTC'
      AND (approval."proposed_snapshot"::jsonb->>'maxOverageHours')::numeric >=
          NEW."overage_period_after";
    IF NOT FOUND THEN
      RAISE EXCEPTION 'professional-service overage requires matching unexpired named approval';
    END IF;
  END IF;

  IF engagement_record."service_type" = 'PENETRATION_TEST' AND
     NEW."activity_type" IN ('TEST_EXECUTION', 'RETEST') AND
     (NEW."occurred_at" < ((engagement_record."rules_of_engagement"::jsonb->>'testWindowStart')::timestamptz AT TIME ZONE 'UTC') OR
      NEW."occurred_at" > ((engagement_record."rules_of_engagement"::jsonb->>'testWindowEnd')::timestamptz AT TIME ZONE 'UTC')) THEN
    RAISE EXCEPTION 'penetration-test activity is outside the authorized test window';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ProfessionalServiceActivity_boundary_guard"
  BEFORE INSERT ON "ProfessionalServiceActivity"
  FOR EACH ROW EXECUTE FUNCTION "enforce_professional_service_activity"();

CREATE FUNCTION "enforce_professional_service_deliverable"() RETURNS trigger AS $$
DECLARE
  engagement_status TEXT;
  approved_title TEXT;
BEGIN
  SELECT engagement."status",
         definition->>'title'
    INTO engagement_status, approved_title
  FROM "ProfessionalServiceEngagement" engagement,
       jsonb_array_elements(engagement."deliverable_definitions"::jsonb) definition
  WHERE engagement."id" = NEW."engagement_id"
    AND engagement."tenant_id" = NEW."tenant_id"
    AND engagement."environment_id" = NEW."environment_id"
    AND engagement."status" IN ('ACTIVE', 'CORRECTION_REQUIRED')
    AND definition->>'key' = NEW."deliverable_key";
  IF NOT FOUND OR approved_title <> NEW."title" THEN
    RAISE EXCEPTION 'deliverable requires matching active tenant/SOW definition';
  END IF;
  IF NEW."correction_of_id" IS NULL THEN
    IF NEW."version" <> 1 OR engagement_status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'initial deliverable must be version one during active delivery';
    END IF;
  ELSE
    PERFORM 1 FROM "ProfessionalServiceDeliverable" prior
    WHERE prior."id" = NEW."correction_of_id"
      AND prior."engagement_id" = NEW."engagement_id"
      AND prior."deliverable_key" = NEW."deliverable_key"
      AND prior."version" = NEW."version" - 1
      AND engagement_status = 'CORRECTION_REQUIRED';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'corrected deliverable must append to the prior version in a correction round';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ProfessionalServiceDeliverable_boundary_guard"
  BEFORE INSERT ON "ProfessionalServiceDeliverable"
  FOR EACH ROW EXECUTE FUNCTION "enforce_professional_service_deliverable"();

CREATE FUNCTION "enforce_professional_service_acceptance"() RETURNS trigger AS $$
BEGIN
  PERFORM 1 FROM "ProfessionalServiceEngagement" engagement
  WHERE engagement."id" = NEW."engagement_id"
    AND engagement."tenant_id" = NEW."tenant_id"
    AND engagement."environment_id" = NEW."environment_id"
    AND engagement."status" = 'AWAITING_ACCEPTANCE';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'acceptance decision requires matching awaiting-acceptance tenant/SOW boundary';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(NEW."reviewed_deliverable_ids"::jsonb) reviewed(id)
    LEFT JOIN "ProfessionalServiceDeliverable" deliverable
      ON deliverable."id" = reviewed.id
      AND deliverable."engagement_id" = NEW."engagement_id"
      AND deliverable."tenant_id" = NEW."tenant_id"
      AND deliverable."environment_id" = NEW."environment_id"
    WHERE deliverable."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'acceptance references a deliverable outside the tenant/SOW boundary';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ProfessionalServiceAcceptanceEvent_boundary_guard"
  BEFORE INSERT ON "ProfessionalServiceAcceptanceEvent"
  FOR EACH ROW EXECUTE FUNCTION "enforce_professional_service_acceptance"();

CREATE FUNCTION "reject_professional_service_append_only_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'professional-service activity, deliverable and acceptance evidence is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ProfessionalServiceActivity_no_update"
  BEFORE UPDATE ON "ProfessionalServiceActivity"
  FOR EACH ROW EXECUTE FUNCTION "reject_professional_service_append_only_mutation"();
CREATE TRIGGER "ProfessionalServiceActivity_no_delete"
  BEFORE DELETE ON "ProfessionalServiceActivity"
  FOR EACH ROW EXECUTE FUNCTION "reject_professional_service_append_only_mutation"();
CREATE TRIGGER "ProfessionalServiceDeliverable_no_update"
  BEFORE UPDATE ON "ProfessionalServiceDeliverable"
  FOR EACH ROW EXECUTE FUNCTION "reject_professional_service_append_only_mutation"();
CREATE TRIGGER "ProfessionalServiceDeliverable_no_delete"
  BEFORE DELETE ON "ProfessionalServiceDeliverable"
  FOR EACH ROW EXECUTE FUNCTION "reject_professional_service_append_only_mutation"();
CREATE TRIGGER "ProfessionalServiceAcceptanceEvent_no_update"
  BEFORE UPDATE ON "ProfessionalServiceAcceptanceEvent"
  FOR EACH ROW EXECUTE FUNCTION "reject_professional_service_append_only_mutation"();
CREATE TRIGGER "ProfessionalServiceAcceptanceEvent_no_delete"
  BEFORE DELETE ON "ProfessionalServiceAcceptanceEvent"
  FOR EACH ROW EXECUTE FUNCTION "reject_professional_service_append_only_mutation"();
