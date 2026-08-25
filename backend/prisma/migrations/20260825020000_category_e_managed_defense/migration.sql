-- Category E: contract-bound Managed Defense scope, independent operational
-- readiness, append-only delivery proof, capacity exceptions and governed
-- capability/credit eligibility. This migration is intentionally not auto-applied.

CREATE TABLE "ManagedDefenseProfile" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "commercial_account_id" TEXT NOT NULL,
  "contract_id" TEXT NOT NULL,
  "profile_key" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "service_tier" TEXT NOT NULL,
  "recurring_pricing_metric" TEXT NOT NULL,
  "price_book_id" TEXT NOT NULL,
  "protected_scope_policy_ids" TEXT NOT NULL DEFAULT '[]',
  "technology_scope" TEXT NOT NULL DEFAULT '{}',
  "meter_policy_ids" TEXT NOT NULL DEFAULT '[]',
  "coverage_window" TEXT NOT NULL DEFAULT 'BUSINESS_HOURS',
  "triage_scope" TEXT NOT NULL DEFAULT '{}',
  "investigation_scope" TEXT NOT NULL DEFAULT '{}',
  "escalation_policy" TEXT NOT NULL DEFAULT '{}',
  "response_support" TEXT NOT NULL DEFAULT '{}',
  "review_cadence" TEXT NOT NULL DEFAULT 'QUARTERLY',
  "customer_dependencies" TEXT NOT NULL DEFAULT '[]',
  "exclusions" TEXT NOT NULL DEFAULT '[]',
  "response_authority" TEXT NOT NULL DEFAULT 'R1',
  "technical_certification_ref" TEXT,
  "customer_authorization_ref" TEXT,
  "credit_eligible_capabilities" TEXT NOT NULL DEFAULT '[]',
  "sla_definition_ids" TEXT NOT NULL DEFAULT '[]',
  "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effective_to" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  "approval_id" TEXT,
  "requested_by" TEXT NOT NULL,
  "approved_by" TEXT,
  "approved_at" TIMESTAMP(3),
  "activated_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManagedDefenseProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ManagedDefenseProfile_effective_window_check" CHECK (
    "effective_to" IS NULL OR "effective_to" > "effective_from"
  ),
  CONSTRAINT "ManagedDefenseProfile_pricing_metric_check" CHECK (
    "recurring_pricing_metric" IN (
      'PROTECTED_RESOURCE_SERVICE_TIER',
      'COMMITTED_ENVIRONMENT_SERVICE_TIER'
    )
  ),
  CONSTRAINT "ManagedDefenseProfile_coverage_window_check" CHECK (
    "coverage_window" IN ('BUSINESS_HOURS', 'EXTENDED', '24X7')
  ),
  CONSTRAINT "ManagedDefenseProfile_response_authority_check" CHECK (
    "response_authority" IN ('R0', 'R1', 'R2', 'R3', 'R4')
  ),
  CONSTRAINT "ManagedDefenseProfile_elevated_authority_check" CHECK (
    "response_authority" IN ('R0', 'R1') OR (
      NULLIF(BTRIM("technical_certification_ref"), '') IS NOT NULL AND
      NULLIF(BTRIM("customer_authorization_ref"), '') IS NOT NULL
    )
  ),
  CONSTRAINT "ManagedDefenseProfile_review_cadence_check" CHECK (
    "review_cadence" IN ('MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL')
  ),
  CONSTRAINT "ManagedDefenseProfile_status_check" CHECK (
    "status" IN ('PENDING_APPROVAL', 'PENDING_READINESS', 'ACTIVE', 'REJECTED', 'SUSPENDED', 'ENDED')
  )
);
CREATE UNIQUE INDEX "ManagedDefenseProfile_approval_id_key"
  ON "ManagedDefenseProfile"("approval_id");
CREATE UNIQUE INDEX "ManagedDefenseProfile_tenant_id_environment_id_profile_key__key"
  ON "ManagedDefenseProfile"("tenant_id", "environment_id", "profile_key", "version");
CREATE INDEX "ManagedDefenseProfile_tenant_id_environment_id_status_idx"
  ON "ManagedDefenseProfile"("tenant_id", "environment_id", "status");
CREATE INDEX "ManagedDefenseProfile_commercial_account_id_status_idx"
  ON "ManagedDefenseProfile"("commercial_account_id", "status");
CREATE INDEX "ManagedDefenseProfile_contract_id_status_idx"
  ON "ManagedDefenseProfile"("contract_id", "status");
CREATE INDEX "ManagedDefenseProfile_effective_from_effective_to_status_idx"
  ON "ManagedDefenseProfile"("effective_from", "effective_to", "status");

CREATE TABLE "ManagedDefenseReadinessAssessment" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "managed_defense_profile_id" TEXT NOT NULL,
  "staffing_ready" BOOLEAN NOT NULL DEFAULT false,
  "on_call_ready" BOOLEAN NOT NULL DEFAULT false,
  "escalation_ready" BOOLEAN NOT NULL DEFAULT false,
  "runbooks_ready" BOOLEAN NOT NULL DEFAULT false,
  "measured_performance_ready" BOOLEAN NOT NULL DEFAULT false,
  "staffing_evidence_refs" TEXT NOT NULL DEFAULT '[]',
  "on_call_evidence_refs" TEXT NOT NULL DEFAULT '[]',
  "escalation_evidence_refs" TEXT NOT NULL DEFAULT '[]',
  "runbook_evidence_refs" TEXT NOT NULL DEFAULT '[]',
  "performance_evidence_refs" TEXT NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
  "verified_by" TEXT,
  "verified_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManagedDefenseReadinessAssessment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ManagedDefenseReadinessAssessment_verified_check" CHECK (
    "status" <> 'VERIFIED' OR (
      "staffing_ready" AND "on_call_ready" AND "escalation_ready" AND
      "runbooks_ready" AND "measured_performance_ready" AND
      "staffing_evidence_refs" <> '[]' AND "on_call_evidence_refs" <> '[]' AND
      "escalation_evidence_refs" <> '[]' AND "runbook_evidence_refs" <> '[]' AND
      "performance_evidence_refs" <> '[]' AND
      NULLIF(BTRIM("verified_by"), '') IS NOT NULL AND "verified_at" IS NOT NULL
    )
  )
);
CREATE UNIQUE INDEX "ManagedDefenseReadinessAssessment_managed_defense_profile_i_key"
  ON "ManagedDefenseReadinessAssessment"("managed_defense_profile_id");
CREATE INDEX "ManagedDefenseReadinessAssessment_tenant_id_environment_id__idx"
  ON "ManagedDefenseReadinessAssessment"("tenant_id", "environment_id", "status");

ALTER TABLE "ServiceObligation"
  ADD COLUMN "tenant_id" TEXT,
  ADD COLUMN "environment_id" TEXT,
  ADD COLUMN "managed_defense_profile_id" TEXT,
  ADD COLUMN "obligation_key" TEXT,
  ADD COLUMN "obligation_scope" TEXT NOT NULL DEFAULT '{}',
  ADD COLUMN "response_authority" TEXT NOT NULL DEFAULT 'R0',
  ADD COLUMN "customer_dependencies" TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN "exclusions" TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN "claim_eligibility" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "claim_eligibility_reason" TEXT,
  ADD COLUMN "claim_assessed_at" TIMESTAMP(3);

-- Legacy SOC rows have neither an exact tenant/environment boundary nor the
-- independent readiness evidence required for an active coverage claim.
UPDATE "ServiceObligation"
SET
  "status" = 'MIGRATION_REVIEW',
  "claim_eligibility" = false,
  "claim_eligibility_reason" = 'LEGACY_SOC_COVERAGE_REQUIRES_PROFILE_AND_READINESS',
  "claim_assessed_at" = CURRENT_TIMESTAMP
WHERE "obligation_type" = 'SOC_COVERAGE';

CREATE INDEX "ServiceObligation_tenant_id_environment_id_status_idx"
  ON "ServiceObligation"("tenant_id", "environment_id", "status");
CREATE INDEX "ServiceObligation_managed_defense_profile_id_status_idx"
  ON "ServiceObligation"("managed_defense_profile_id", "status");
ALTER TABLE "ServiceObligation"
  ADD CONSTRAINT "ServiceObligation_response_authority_check" CHECK (
    "response_authority" IN ('R0', 'R1', 'R2', 'R3', 'R4')
  );

CREATE TABLE "ManagedDefenseDeliveryEvent" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "managed_defense_profile_id" TEXT NOT NULL,
  "service_obligation_id" TEXT,
  "event_type" TEXT NOT NULL,
  "source_reference" TEXT NOT NULL,
  "evidence_reference" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "details" TEXT NOT NULL DEFAULT '{}',
  "immutable_hash" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManagedDefenseDeliveryEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ManagedDefenseDeliveryEvent_nonempty_evidence_check" CHECK (
    NULLIF(BTRIM("source_reference"), '') IS NOT NULL AND
    NULLIF(BTRIM("evidence_reference"), '') IS NOT NULL AND
    NULLIF(BTRIM("actor_id"), '') IS NOT NULL AND
    NULLIF(BTRIM("immutable_hash"), '') IS NOT NULL
  ),
  CONSTRAINT "ManagedDefenseDeliveryEvent_type_check" CHECK (
    "event_type" IN (
      'CASE_ACTIVITY', 'ANALYST_ACTION', 'CUSTOMER_NOTIFICATION', 'SLA_CLOCK',
      'ESCALATION', 'OBLIGATION_STATUS', 'CAPACITY_EXCEPTION',
      'POST_INCIDENT_RECONCILIATION'
    )
  )
);
CREATE INDEX "ManagedDefenseDeliveryEvent_tenant_id_environment_id_occurred_a"
  ON "ManagedDefenseDeliveryEvent"("tenant_id", "environment_id", "occurred_at");
CREATE INDEX "ManagedDefenseDeliveryEvent_managed_defense_profile_id_occurred"
  ON "ManagedDefenseDeliveryEvent"("managed_defense_profile_id", "occurred_at");
CREATE INDEX "ManagedDefenseDeliveryEvent_service_obligation_id_occurred_at_i"
  ON "ManagedDefenseDeliveryEvent"("service_obligation_id", "occurred_at");
CREATE INDEX "ManagedDefenseDeliveryEvent_event_type_idx"
  ON "ManagedDefenseDeliveryEvent"("event_type");

CREATE TABLE "ManagedDefenseCapacityException" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "managed_defense_profile_id" TEXT NOT NULL,
  "current_volume" INTEGER NOT NULL,
  "forecast_volume" INTEGER NOT NULL,
  "capacity_basis" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "event_processing_preserved" BOOLEAN NOT NULL DEFAULT true,
  "critical_response_preserved" BOOLEAN NOT NULL DEFAULT true,
  "overflow_policy" TEXT NOT NULL,
  "named_customer_authorizer" TEXT,
  "customer_authorization_ref" TEXT,
  "customer_authorized_at" TIMESTAMP(3),
  "estimated_third_party_cost" DECIMAL(14,4),
  "paid_work_status" TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
  "approval_id" TEXT,
  "reconciliation_snapshot" TEXT NOT NULL DEFAULT '{}',
  "reconciled_by" TEXT,
  "reconciled_at" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "opened_by" TEXT NOT NULL,
  "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManagedDefenseCapacityException_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ManagedDefenseCapacityException_volume_check" CHECK (
    "current_volume" > 0 AND "forecast_volume" > 0
  ),
  CONSTRAINT "ManagedDefenseCapacityException_security_preserved_check" CHECK (
    "event_processing_preserved" AND "critical_response_preserved"
  ),
  CONSTRAINT "ManagedDefenseCapacityException_overflow_policy_check" CHECK (
    "overflow_policy" IN (
      'INCLUDED_FAIR_USE', 'APPROVED_THIRD_PARTY',
      'CUSTOMER_AUTHORIZED_PAID_WORK', 'POST_INCIDENT_RECONCILIATION'
    )
  ),
  CONSTRAINT "ManagedDefenseCapacityException_paid_authorization_check" CHECK (
    "overflow_policy" <> 'CUSTOMER_AUTHORIZED_PAID_WORK' OR (
      NULLIF(BTRIM("named_customer_authorizer"), '') IS NOT NULL AND
      NULLIF(BTRIM("customer_authorization_ref"), '') IS NOT NULL AND
      "customer_authorized_at" IS NOT NULL AND "estimated_third_party_cost" > 0
    )
  )
);
CREATE UNIQUE INDEX "ManagedDefenseCapacityException_approval_id_key"
  ON "ManagedDefenseCapacityException"("approval_id");
CREATE INDEX "ManagedDefenseCapacityException_tenant_id_environment_id_status"
  ON "ManagedDefenseCapacityException"("tenant_id", "environment_id", "status");
CREATE INDEX "ManagedDefenseCapacityException_managed_defense_profile_id_stat"
  ON "ManagedDefenseCapacityException"("managed_defense_profile_id", "status");

CREATE TABLE "ManagedDefenseCapabilityImpact" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "managed_defense_profile_id" TEXT NOT NULL,
  "capability_key" TEXT NOT NULL,
  "affected_scope" TEXT NOT NULL,
  "connector_reference" TEXT,
  "failure_type" TEXT NOT NULL,
  "claim_eligibility" BOOLEAN NOT NULL DEFAULT false,
  "eligibility_reason" TEXT NOT NULL,
  "sla_definition_id" TEXT,
  "evidence_refs" TEXT NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "recorded_by" TEXT NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManagedDefenseCapabilityImpact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ManagedDefenseCapabilityImpact_failure_type_check" CHECK (
    "failure_type" IN (
      'SUPPORTED_CONNECTOR_FAILURE', 'UNSUPPORTED_CONNECTOR',
      'CUSTOMER_ACCESS_LOSS', 'THIRD_PARTY_OUTAGE', 'EXCLUDED_SERVICE_WINDOW'
    )
  ),
  CONSTRAINT "ManagedDefenseCapabilityImpact_claim_check" CHECK (
    NOT "claim_eligibility" OR (
      "failure_type" = 'SUPPORTED_CONNECTOR_FAILURE' AND
      "sla_definition_id" IS NOT NULL
    )
  )
);
CREATE INDEX "ManagedDefenseCapabilityImpact_tenant_id_environment_id_status_"
  ON "ManagedDefenseCapabilityImpact"("tenant_id", "environment_id", "status");
CREATE INDEX "ManagedDefenseCapabilityImpact_managed_defense_profile_id_statu"
  ON "ManagedDefenseCapabilityImpact"("managed_defense_profile_id", "status");
CREATE INDEX "ManagedDefenseCapabilityImpact_sla_definition_id_idx"
  ON "ManagedDefenseCapabilityImpact"("sla_definition_id");
CREATE INDEX "ManagedDefenseCapabilityImpact_claim_eligibility_status_idx"
  ON "ManagedDefenseCapabilityImpact"("claim_eligibility", "status");

ALTER TABLE "ManagedDefenseProfile"
  ADD CONSTRAINT "ManagedDefenseProfile_commercial_account_id_fkey"
  FOREIGN KEY ("commercial_account_id") REFERENCES "CommercialAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManagedDefenseProfile"
  ADD CONSTRAINT "ManagedDefenseProfile_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "Contract"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManagedDefenseReadinessAssessment"
  ADD CONSTRAINT "ManagedDefenseReadinessAssessment_managed_defense_profile__fkey"
  FOREIGN KEY ("managed_defense_profile_id") REFERENCES "ManagedDefenseProfile"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceObligation"
  ADD CONSTRAINT "ServiceObligation_managed_defense_profile_id_fkey"
  FOREIGN KEY ("managed_defense_profile_id") REFERENCES "ManagedDefenseProfile"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ManagedDefenseDeliveryEvent"
  ADD CONSTRAINT "ManagedDefenseDeliveryEvent_managed_defense_profile_id_fkey"
  FOREIGN KEY ("managed_defense_profile_id") REFERENCES "ManagedDefenseProfile"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManagedDefenseDeliveryEvent"
  ADD CONSTRAINT "ManagedDefenseDeliveryEvent_service_obligation_id_fkey"
  FOREIGN KEY ("service_obligation_id") REFERENCES "ServiceObligation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ManagedDefenseCapacityException"
  ADD CONSTRAINT "ManagedDefenseCapacityException_managed_defense_profile_id_fkey"
  FOREIGN KEY ("managed_defense_profile_id") REFERENCES "ManagedDefenseProfile"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManagedDefenseCapabilityImpact"
  ADD CONSTRAINT "ManagedDefenseCapabilityImpact_managed_defense_profile_id_fkey"
  FOREIGN KEY ("managed_defense_profile_id") REFERENCES "ManagedDefenseProfile"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManagedDefenseCapabilityImpact"
  ADD CONSTRAINT "ManagedDefenseCapabilityImpact_sla_definition_id_fkey"
  FOREIGN KEY ("sla_definition_id") REFERENCES "SlaDefinition"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- A commercial approval alone cannot activate a coverage claim. Database-side
-- guards also require complete, independently verified operational readiness.
CREATE FUNCTION "enforce_managed_defense_activation_readiness"() RETURNS trigger AS $$
BEGIN
  IF NEW."status" = 'ACTIVE' THEN
    PERFORM 1
    FROM "ManagedDefenseReadinessAssessment" AS readiness
    WHERE readiness."managed_defense_profile_id" = NEW."id"
      AND readiness."tenant_id" = NEW."tenant_id"
      AND readiness."environment_id" = NEW."environment_id"
      AND readiness."status" = 'VERIFIED'
      AND readiness."staffing_ready"
      AND readiness."on_call_ready"
      AND readiness."escalation_ready"
      AND readiness."runbooks_ready"
      AND readiness."measured_performance_ready"
      AND readiness."verified_by" IS DISTINCT FROM NEW."requested_by"
      AND readiness."verified_by" IS DISTINCT FROM NEW."approved_by";
    IF NOT FOUND THEN
      RAISE EXCEPTION 'managed defense activation requires complete independent readiness';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ManagedDefenseProfile_activation_readiness"
  BEFORE INSERT OR UPDATE ON "ManagedDefenseProfile"
  FOR EACH ROW EXECUTE FUNCTION "enforce_managed_defense_activation_readiness"();

CREATE FUNCTION "enforce_soc_obligation_profile"() RETURNS trigger AS $$
BEGIN
  IF NEW."obligation_type" = 'SOC_COVERAGE' AND NEW."status" <> 'MIGRATION_REVIEW' THEN
    IF NEW."tenant_id" IS NULL OR NEW."environment_id" IS NULL OR
       NEW."managed_defense_profile_id" IS NULL THEN
      RAISE EXCEPTION 'SOC coverage requires a tenant-bound managed defense profile';
    END IF;
    PERFORM 1
    FROM "ManagedDefenseProfile" AS profile
    JOIN "ManagedDefenseReadinessAssessment" AS readiness
      ON readiness."managed_defense_profile_id" = profile."id"
    WHERE profile."id" = NEW."managed_defense_profile_id"
      AND profile."contract_id" = NEW."contract_id"
      AND profile."tenant_id" = NEW."tenant_id"
      AND profile."environment_id" = NEW."environment_id"
      AND profile."status" = 'ACTIVE'
      AND readiness."status" = 'VERIFIED';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SOC coverage requires the matching active readiness-verified profile';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ServiceObligation_soc_profile_guard"
  BEFORE INSERT OR UPDATE ON "ServiceObligation"
  FOR EACH ROW EXECUTE FUNCTION "enforce_soc_obligation_profile"();

-- Delivery facts are immutable; corrections are represented by a new event.
CREATE FUNCTION "reject_managed_defense_delivery_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'managed defense delivery evidence is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ManagedDefenseDeliveryEvent_immutable_mutation"
  BEFORE UPDATE OR DELETE ON "ManagedDefenseDeliveryEvent"
  FOR EACH ROW EXECUTE FUNCTION "reject_managed_defense_delivery_mutation"();
