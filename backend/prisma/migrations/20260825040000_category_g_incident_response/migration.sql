-- Category G batch 1: governed Incident Response retainers, restricted
-- activations, append-only consumption, emergency reconciliation,
-- pass-through approvals and purpose-bound legal-sensitive records.
-- This migration is intentionally generated but not auto-applied.

CREATE TABLE "IncidentResponseRetainer" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "commercial_account_id" TEXT NOT NULL,
  "contract_id" TEXT NOT NULL,
  "service_obligation_id" TEXT NOT NULL,
  "retainer_key" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "price_book_id" TEXT NOT NULL,
  "term_start" TIMESTAMP(3) NOT NULL,
  "term_end" TIMESTAMP(3) NOT NULL,
  "included_hours" DECIMAL(8,2) NOT NULL,
  "included_services" TEXT NOT NULL DEFAULT '[]',
  "response_window" TEXT NOT NULL DEFAULT '{}',
  "readiness_obligations" TEXT NOT NULL DEFAULT '{}',
  "exclusions" TEXT NOT NULL DEFAULT '[]',
  "maximum_response_authority" TEXT NOT NULL DEFAULT 'R1',
  "overage_policy" TEXT NOT NULL DEFAULT 'REQUIRE_APPROVAL',
  "overage_cap_hours" DECIMAL(8,2),
  "overage_rate" DECIMAL(14,4),
  "warning_threshold_percent" INTEGER NOT NULL DEFAULT 80,
  "rollover_policy" TEXT NOT NULL DEFAULT 'NONE',
  "rollover_cap_hours" DECIMAL(8,2),
  "named_activation_path" TEXT NOT NULL DEFAULT '{}',
  "emergency_provision" TEXT NOT NULL DEFAULT '{}',
  "third_party_cost_policy" TEXT NOT NULL DEFAULT '{}',
  "legal_service_scope" TEXT NOT NULL DEFAULT '{}',
  "no_legal_conclusion_wording" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  "approval_id" TEXT,
  "requested_by" TEXT NOT NULL,
  "approved_by" TEXT,
  "approved_at" TIMESTAMP(3),
  "activated_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IncidentResponseRetainer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IncidentResponseRetainer_annual_term_check" CHECK (
    "term_end" >= "term_start" + INTERVAL '300 days' AND
    "term_end" <= "term_start" + INTERVAL '370 days'
  ),
  CONSTRAINT "IncidentResponseRetainer_hours_check" CHECK (
    "included_hours" > 0 AND
    ("overage_cap_hours" IS NULL OR "overage_cap_hours" > 0) AND
    ("overage_rate" IS NULL OR "overage_rate" >= 0) AND
    ("rollover_cap_hours" IS NULL OR "rollover_cap_hours" > 0)
  ),
  CONSTRAINT "IncidentResponseRetainer_scope_check" CHECK (
    "included_services" <> '[]' AND "response_window" <> '{}' AND
    "readiness_obligations" <> '{}' AND "named_activation_path" <> '{}' AND
    "emergency_provision" <> '{}' AND "third_party_cost_policy" <> '{}' AND
    "legal_service_scope" <> '{}'
  ),
  CONSTRAINT "IncidentResponseRetainer_authority_check" CHECK (
    "maximum_response_authority" IN ('R0', 'R1', 'R2', 'R3', 'R4')
  ),
  CONSTRAINT "IncidentResponseRetainer_overage_check" CHECK (
    "overage_policy" IN ('BLOCK', 'REQUIRE_APPROVAL', 'ALLOW_CAPPED') AND
    ("overage_policy" <> 'ALLOW_CAPPED' OR "overage_cap_hours" > 0) AND
    ("overage_policy" <> 'BLOCK' OR ("overage_cap_hours" IS NULL AND COALESCE("overage_rate", 0) = 0))
  ),
  CONSTRAINT "IncidentResponseRetainer_rollover_check" CHECK (
    "rollover_policy" IN ('NONE', 'CAPPED', 'FULL') AND
    ("rollover_policy" <> 'CAPPED' OR "rollover_cap_hours" > 0) AND
    ("rollover_policy" <> 'NONE' OR "rollover_cap_hours" IS NULL)
  ),
  CONSTRAINT "IncidentResponseRetainer_warning_check" CHECK (
    "warning_threshold_percent" BETWEEN 1 AND 100
  ),
  CONSTRAINT "IncidentResponseRetainer_status_check" CHECK (
    "status" IN ('PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'SUSPENDED', 'ENDED')
  ),
  CONSTRAINT "IncidentResponseRetainer_activation_check" CHECK (
    "status" <> 'ACTIVE' OR (
      "approval_id" IS NOT NULL AND NULLIF(BTRIM("approved_by"), '') IS NOT NULL AND
      "approved_at" IS NOT NULL AND "activated_at" IS NOT NULL
    )
  ),
  CONSTRAINT "IncidentResponseRetainer_no_legal_claim_check" CHECK (
    NULLIF(BTRIM("no_legal_conclusion_wording"), '') IS NOT NULL
  )
);
CREATE UNIQUE INDEX "IncidentResponseRetainer_service_obligation_id_key"
  ON "IncidentResponseRetainer"("service_obligation_id");
CREATE UNIQUE INDEX "IncidentResponseRetainer_approval_id_key"
  ON "IncidentResponseRetainer"("approval_id");
CREATE UNIQUE INDEX "IncidentResponseRetainer_tenant_id_environment_id_retainer_key_version_key"
  ON "IncidentResponseRetainer"("tenant_id", "environment_id", "retainer_key", "version");
CREATE INDEX "IncidentResponseRetainer_tenant_id_environment_id_status_idx"
  ON "IncidentResponseRetainer"("tenant_id", "environment_id", "status");
CREATE INDEX "IncidentResponseRetainer_commercial_account_id_status_idx"
  ON "IncidentResponseRetainer"("commercial_account_id", "status");
CREATE INDEX "IncidentResponseRetainer_contract_id_status_idx"
  ON "IncidentResponseRetainer"("contract_id", "status");
CREATE INDEX "IncidentResponseRetainer_term_start_term_end_status_idx"
  ON "IncidentResponseRetainer"("term_start", "term_end", "status");
ALTER TABLE "IncidentResponseRetainer"
  ADD CONSTRAINT "IncidentResponseRetainer_commercial_account_id_fkey"
  FOREIGN KEY ("commercial_account_id") REFERENCES "CommercialAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IncidentResponseRetainer"
  ADD CONSTRAINT "IncidentResponseRetainer_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "Contract"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IncidentResponseRetainer"
  ADD CONSTRAINT "IncidentResponseRetainer_service_obligation_id_fkey"
  FOREIGN KEY ("service_obligation_id") REFERENCES "ServiceObligation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing unscoped work orders cannot be assigned to a tenant or governed
-- retainer without explicit review, so they remain visible only as legacy data.
ALTER TABLE "IncidentWorkOrder"
  ADD COLUMN "tenant_id" TEXT,
  ADD COLUMN "environment_id" TEXT,
  ADD COLUMN "retainer_id" TEXT,
  ADD COLUMN "activation_reference" TEXT NOT NULL DEFAULT 'MIGRATION_REVIEW',
  ADD COLUMN "authority_scope" TEXT NOT NULL DEFAULT '{}',
  ADD COLUMN "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "customer_command_structure" TEXT NOT NULL DEFAULT '{}',
  ADD COLUMN "included_services" TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN "response_window" TEXT NOT NULL DEFAULT '{}',
  ADD COLUMN "overage_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN "forecast_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN "warning_threshold_percent" INTEGER NOT NULL DEFAULT 80,
  ADD COLUMN "threshold_state" TEXT NOT NULL DEFAULT 'WITHIN_ALLOWANCE',
  ADD COLUMN "emergency_provision_reference" TEXT,
  ADD COLUMN "emergency_reconciliation_status" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "emergency_reconciliation_approval_id" TEXT,
  ADD COLUMN "emergency_reconciliation_reference" TEXT,
  ADD COLUMN "emergency_reconciled_by" TEXT,
  ADD COLUMN "emergency_reconciled_at" TIMESTAMP(3),
  ADD COLUMN "closure_summary" TEXT,
  ADD COLUMN "closure_evidence_refs" TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN "customer_acknowledgement_ref" TEXT,
  ADD COLUMN "no_privilege_or_notification_determination" TEXT NOT NULL DEFAULT 'This work order does not establish legal privilege or provide a breach-notification, regulatory, or legal conclusion.';

UPDATE "IncidentWorkOrder" SET "status" = 'MIGRATION_REVIEW';

CREATE UNIQUE INDEX "IncidentWorkOrder_emergency_reconciliation_approval_id_key"
  ON "IncidentWorkOrder"("emergency_reconciliation_approval_id");
CREATE UNIQUE INDEX "IncidentWorkOrder_tenant_id_environment_id_incident_reference_key"
  ON "IncidentWorkOrder"("tenant_id", "environment_id", "incident_reference");
CREATE INDEX "IncidentWorkOrder_tenant_id_environment_id_status_idx"
  ON "IncidentWorkOrder"("tenant_id", "environment_id", "status");
CREATE INDEX "IncidentWorkOrder_retainer_id_status_idx"
  ON "IncidentWorkOrder"("retainer_id", "status");
ALTER TABLE "IncidentWorkOrder"
  ADD CONSTRAINT "IncidentWorkOrder_retainer_id_fkey"
  FOREIGN KEY ("retainer_id") REFERENCES "IncidentResponseRetainer"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IncidentWorkOrder"
  ADD CONSTRAINT "IncidentWorkOrder_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "Contract"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IncidentWorkOrder"
  ADD CONSTRAINT "IncidentWorkOrder_quantities_check" CHECK (
    "included_hours" >= 0 AND "consumed_hours" >= 0 AND "overage_hours" >= 0 AND
    "forecast_hours" >= 0 AND "third_party_costs" >= 0 AND
    "warning_threshold_percent" BETWEEN 1 AND 100
  );
ALTER TABLE "IncidentWorkOrder"
  ADD CONSTRAINT "IncidentWorkOrder_authority_check" CHECK (
    "response_authority" IN ('R0', 'R1', 'R2', 'R3', 'R4')
  );
ALTER TABLE "IncidentWorkOrder"
  ADD CONSTRAINT "IncidentWorkOrder_overage_check" CHECK (
    "overage_policy" IN ('BLOCK', 'REQUIRE_APPROVAL', 'ALLOW_CAPPED')
  );
ALTER TABLE "IncidentWorkOrder"
  ADD CONSTRAINT "IncidentWorkOrder_threshold_check" CHECK (
    "threshold_state" IN ('WITHIN_ALLOWANCE', 'WARNING', 'OVERAGE')
  );
ALTER TABLE "IncidentWorkOrder"
  ADD CONSTRAINT "IncidentWorkOrder_reconciliation_check" CHECK (
    "emergency_reconciliation_status" IN ('NOT_REQUIRED', 'REQUIRED', 'PENDING_APPROVAL', 'RECONCILED') AND
    ("emergency_reconciliation_status" <> 'RECONCILED' OR (
      "emergency_reconciliation_approval_id" IS NOT NULL AND
      NULLIF(BTRIM("emergency_reconciled_by"), '') IS NOT NULL AND
      "emergency_reconciled_at" IS NOT NULL
    ))
  );
ALTER TABLE "IncidentWorkOrder"
  ADD CONSTRAINT "IncidentWorkOrder_closure_check" CHECK (
    "status" <> 'CLOSED' OR (
      NULLIF(BTRIM("closure_summary"), '') IS NOT NULL AND
      "closure_evidence_refs" <> '[]' AND
      NULLIF(BTRIM("customer_acknowledgement_ref"), '') IS NOT NULL AND
      "closed_at" IS NOT NULL
    )
  );

CREATE TABLE "IncidentWorkOrderConsumption" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "work_order_id" TEXT NOT NULL,
  "entry_type" TEXT NOT NULL DEFAULT 'STANDARD',
  "hours" DECIMAL(8,2) NOT NULL,
  "included_total_after" DECIMAL(8,2) NOT NULL,
  "overage_total_after" DECIMAL(8,2) NOT NULL,
  "forecast_hours_after" DECIMAL(8,2) NOT NULL,
  "threshold_state" TEXT NOT NULL,
  "overage_approval_id" TEXT,
  "emergency_provision_ref" TEXT,
  "work_description" TEXT NOT NULL,
  "evidence_reference" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IncidentWorkOrderConsumption_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IncidentWorkOrderConsumption_values_check" CHECK (
    "hours" > 0 AND "included_total_after" >= 0 AND
    "overage_total_after" >= 0 AND "forecast_hours_after" >= 0
  ),
  CONSTRAINT "IncidentWorkOrderConsumption_type_check" CHECK (
    "entry_type" IN ('STANDARD', 'PREAUTHORIZED_OVERAGE', 'APPROVED_OVERAGE', 'EMERGENCY_CONTINUITY') AND
    ("entry_type" <> 'APPROVED_OVERAGE' OR "overage_approval_id" IS NOT NULL) AND
    ("entry_type" <> 'EMERGENCY_CONTINUITY' OR NULLIF(BTRIM("emergency_provision_ref"), '') IS NOT NULL)
  ),
  CONSTRAINT "IncidentWorkOrderConsumption_evidence_check" CHECK (
    NULLIF(BTRIM("work_description"), '') IS NOT NULL AND
    NULLIF(BTRIM("evidence_reference"), '') IS NOT NULL AND
    NULLIF(BTRIM("actor_id"), '') IS NOT NULL
  )
);
CREATE INDEX "IncidentWorkOrderConsumption_tenant_id_environment_id_occurred_at_idx"
  ON "IncidentWorkOrderConsumption"("tenant_id", "environment_id", "occurred_at");
CREATE INDEX "IncidentWorkOrderConsumption_work_order_id_occurred_at_idx"
  ON "IncidentWorkOrderConsumption"("work_order_id", "occurred_at");
CREATE INDEX "IncidentWorkOrderConsumption_entry_type_idx"
  ON "IncidentWorkOrderConsumption"("entry_type");
ALTER TABLE "IncidentWorkOrderConsumption"
  ADD CONSTRAINT "IncidentWorkOrderConsumption_work_order_id_fkey"
  FOREIGN KEY ("work_order_id") REFERENCES "IncidentWorkOrder"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ThirdPartyPassThroughCost" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "work_order_id" TEXT NOT NULL,
  "cost_type" TEXT NOT NULL,
  "supplier_reference" TEXT NOT NULL,
  "contract_policy_reference" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "base_amount" DECIMAL(14,4) NOT NULL,
  "markup_percent" DECIMAL(8,4) NOT NULL DEFAULT 0,
  "customer_amount" DECIMAL(14,4) NOT NULL,
  "currency" TEXT NOT NULL,
  "named_customer_authorizer" TEXT NOT NULL,
  "customer_approval_reference" TEXT NOT NULL,
  "approval_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  "requested_by" TEXT NOT NULL,
  "approved_by" TEXT,
  "approved_at" TIMESTAMP(3),
  "evidence_refs" TEXT NOT NULL DEFAULT '[]',
  "incurred_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ThirdPartyPassThroughCost_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ThirdPartyPassThroughCost_amount_check" CHECK (
    "base_amount" > 0 AND "markup_percent" >= 0 AND "markup_percent" <= 100 AND
    "customer_amount" = ROUND("base_amount" * (1 + "markup_percent" / 100), 4)
  ),
  CONSTRAINT "ThirdPartyPassThroughCost_approval_check" CHECK (
    "status" IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED') AND
    ("status" <> 'APPROVED' OR (
      "approval_id" IS NOT NULL AND NULLIF(BTRIM("approved_by"), '') IS NOT NULL AND
      "approved_at" IS NOT NULL
    ))
  ),
  CONSTRAINT "ThirdPartyPassThroughCost_scope_check" CHECK (
    NULLIF(BTRIM("supplier_reference"), '') IS NOT NULL AND
    NULLIF(BTRIM("contract_policy_reference"), '') IS NOT NULL AND
    NULLIF(BTRIM("named_customer_authorizer"), '') IS NOT NULL AND
    NULLIF(BTRIM("customer_approval_reference"), '') IS NOT NULL AND
    "evidence_refs" <> '[]'
  )
);
CREATE UNIQUE INDEX "ThirdPartyPassThroughCost_approval_id_key"
  ON "ThirdPartyPassThroughCost"("approval_id");
CREATE INDEX "ThirdPartyPassThroughCost_tenant_id_environment_id_status_idx"
  ON "ThirdPartyPassThroughCost"("tenant_id", "environment_id", "status");
CREATE INDEX "ThirdPartyPassThroughCost_work_order_id_status_idx"
  ON "ThirdPartyPassThroughCost"("work_order_id", "status");
CREATE INDEX "ThirdPartyPassThroughCost_incurred_at_idx"
  ON "ThirdPartyPassThroughCost"("incurred_at");
ALTER TABLE "ThirdPartyPassThroughCost"
  ADD CONSTRAINT "ThirdPartyPassThroughCost_work_order_id_fkey"
  FOREIGN KEY ("work_order_id") REFERENCES "IncidentWorkOrder"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "IncidentLegalSensitiveRecord" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "work_order_id" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "privilege_status" TEXT NOT NULL DEFAULT 'NOT_ASSERTED',
  "notification_status" TEXT NOT NULL DEFAULT 'NOT_DETERMINED',
  "counsel_controlled" BOOLEAN NOT NULL DEFAULT false,
  "separate_legal_service_ref" TEXT,
  "counsel_actor_ref" TEXT,
  "conclusion_reference" TEXT,
  "content_reference" TEXT NOT NULL,
  "access_reason" TEXT NOT NULL,
  "no_legal_advice_wording" TEXT NOT NULL,
  "recorded_by" TEXT NOT NULL,
  "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IncidentLegalSensitiveRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IncidentLegalSensitiveRecord_status_check" CHECK (
    "purpose" IN ('INCIDENT_COUNSEL_COORDINATION', 'BREACH_NOTIFICATION_ANALYSIS', 'FORENSIC_LEGAL_REVIEW') AND
    "privilege_status" IN ('NOT_ASSERTED', 'COUNSEL_ASSERTED') AND
    "notification_status" IN ('NOT_DETERMINED', 'COUNSEL_DETERMINED')
  ),
  CONSTRAINT "IncidentLegalSensitiveRecord_reference_check" CHECK (
    NULLIF(BTRIM("content_reference"), '') IS NOT NULL AND
    NULLIF(BTRIM("access_reason"), '') IS NOT NULL AND
    NULLIF(BTRIM("no_legal_advice_wording"), '') IS NOT NULL AND
    NULLIF(BTRIM("recorded_by"), '') IS NOT NULL
  )
);
CREATE INDEX "IncidentLegalSensitiveRecord_tenant_id_environment_id_purpose_idx"
  ON "IncidentLegalSensitiveRecord"("tenant_id", "environment_id", "purpose");
CREATE INDEX "IncidentLegalSensitiveRecord_work_order_id_recorded_at_idx"
  ON "IncidentLegalSensitiveRecord"("work_order_id", "recorded_at");
ALTER TABLE "IncidentLegalSensitiveRecord"
  ADD CONSTRAINT "IncidentLegalSensitiveRecord_work_order_id_fkey"
  FOREIGN KEY ("work_order_id") REFERENCES "IncidentWorkOrder"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "IncidentLegalAccessEvent" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "legal_record_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "access_reason" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "accessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IncidentLegalAccessEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IncidentLegalAccessEvent_access_check" CHECK (
    "action" IN ('CREATE', 'READ') AND
    NULLIF(BTRIM("access_reason"), '') IS NOT NULL AND
    NULLIF(BTRIM("actor_id"), '') IS NOT NULL
  )
);
CREATE INDEX "IncidentLegalAccessEvent_tenant_id_environment_id_accessed_at_idx"
  ON "IncidentLegalAccessEvent"("tenant_id", "environment_id", "accessed_at");
CREATE INDEX "IncidentLegalAccessEvent_legal_record_id_accessed_at_idx"
  ON "IncidentLegalAccessEvent"("legal_record_id", "accessed_at");
ALTER TABLE "IncidentLegalAccessEvent"
  ADD CONSTRAINT "IncidentLegalAccessEvent_legal_record_id_fkey"
  FOREIGN KEY ("legal_record_id") REFERENCES "IncidentLegalSensitiveRecord"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "enforce_ir_retainer_activation"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."status" = 'ACTIVE' AND
     (to_jsonb(NEW) - ARRAY['status', 'updated_at']::text[]) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status', 'updated_at']::text[]) THEN
    RAISE EXCEPTION 'active IR retainer scope and economics are immutable';
  END IF;
  IF NEW."status" = 'ACTIVE' THEN
    PERFORM 1
    FROM "Contract" contract
    JOIN "ServiceObligation" obligation
      ON obligation."id" = NEW."service_obligation_id"
    WHERE contract."id" = NEW."contract_id"
      AND contract."commercial_account_id" = NEW."commercial_account_id"
      AND contract."status" = 'ACTIVE'
      AND NEW."term_start" >= contract."term_start"
      AND NEW."term_end" <= contract."term_end"
      AND obligation."tenant_id" = NEW."tenant_id"
      AND obligation."environment_id" = NEW."environment_id"
      AND obligation."contract_id" = NEW."contract_id"
      AND obligation."obligation_type" = 'IR_RETAINER'
      AND obligation."status" = 'ACTIVE';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'active IR retainer requires matching active contract and tenant-bound service obligation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "IncidentResponseRetainer_activation_guard"
  BEFORE INSERT OR UPDATE ON "IncidentResponseRetainer"
  FOR EACH ROW EXECUTE FUNCTION "enforce_ir_retainer_activation"();

-- Non-legacy work orders must resolve to the same active retainer, contract,
-- tenant/environment and active IR service obligation at activation time.
CREATE FUNCTION "enforce_ir_work_order_boundary"() RETURNS trigger AS $$
BEGIN
  IF NEW."status" <> 'MIGRATION_REVIEW' THEN
    IF NEW."tenant_id" IS NULL OR NEW."environment_id" IS NULL OR NEW."retainer_id" IS NULL OR
       NEW."authority_scope" = '{}' OR NEW."customer_command_structure" = '{}' OR
       NEW."included_services" = '[]' OR NEW."response_window" = '{}' OR
       NEW."evidence_refs" = '[]' OR
       NULLIF(BTRIM(NEW."activation_reference"), '') IS NULL THEN
      RAISE EXCEPTION 'incident work order requires exact tenant, retainer, authority, command and readiness scope';
    END IF;
    IF TG_OP = 'INSERT' THEN
      PERFORM 1
      FROM "IncidentResponseRetainer" retainer
      JOIN "ServiceObligation" obligation
        ON obligation."id" = retainer."service_obligation_id"
      WHERE retainer."id" = NEW."retainer_id"
        AND retainer."tenant_id" = NEW."tenant_id"
        AND retainer."environment_id" = NEW."environment_id"
        AND retainer."contract_id" = NEW."contract_id"
        AND retainer."status" = 'ACTIVE'
        AND retainer."term_start" <= NEW."started_at"
        AND retainer."term_end" >= NEW."started_at"
        AND obligation."tenant_id" = NEW."tenant_id"
        AND obligation."environment_id" = NEW."environment_id"
        AND obligation."contract_id" = NEW."contract_id"
        AND obligation."obligation_type" = 'IR_RETAINER'
        AND obligation."status" = 'ACTIVE';
    ELSE
      -- An incident already activated under a valid retainer can be updated or
      -- closed after the retainer term/status changes, but never rebound.
      IF NEW."incident_reference" IS DISTINCT FROM OLD."incident_reference" OR
         NEW."activation_reason" IS DISTINCT FROM OLD."activation_reason" OR
         NEW."activation_reference" IS DISTINCT FROM OLD."activation_reference" OR
         NEW."response_authority" IS DISTINCT FROM OLD."response_authority" OR
         NEW."authority_scope" IS DISTINCT FROM OLD."authority_scope" OR
         NEW."activated_at" IS DISTINCT FROM OLD."activated_at" OR
         NEW."started_at" IS DISTINCT FROM OLD."started_at" OR
         NEW."authorized_by" IS DISTINCT FROM OLD."authorized_by" OR
         NEW."customer_command_structure" IS DISTINCT FROM OLD."customer_command_structure" OR
         NEW."included_services" IS DISTINCT FROM OLD."included_services" OR
         NEW."response_window" IS DISTINCT FROM OLD."response_window" OR
         NEW."included_hours" IS DISTINCT FROM OLD."included_hours" OR
         NEW."warning_threshold_percent" IS DISTINCT FROM OLD."warning_threshold_percent" OR
         NEW."overage_policy" IS DISTINCT FROM OLD."overage_policy" OR
         NEW."overage_cap_hours" IS DISTINCT FROM OLD."overage_cap_hours" OR
         NEW."no_privilege_or_notification_determination" IS DISTINCT FROM OLD."no_privilege_or_notification_determination" THEN
        RAISE EXCEPTION 'incident activation authority and contracted economics are immutable';
      END IF;
      PERFORM 1
      FROM "IncidentResponseRetainer" retainer
      WHERE retainer."id" = NEW."retainer_id"
        AND retainer."tenant_id" = NEW."tenant_id"
        AND retainer."environment_id" = NEW."environment_id"
        AND retainer."contract_id" = NEW."contract_id"
        AND NEW."retainer_id" IS NOT DISTINCT FROM OLD."retainer_id"
        AND NEW."tenant_id" IS NOT DISTINCT FROM OLD."tenant_id"
        AND NEW."environment_id" IS NOT DISTINCT FROM OLD."environment_id"
        AND NEW."contract_id" IS NOT DISTINCT FROM OLD."contract_id";
    END IF;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'incident work order requires a matching active retainer and service obligation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "IncidentWorkOrder_boundary_guard"
  BEFORE INSERT OR UPDATE ON "IncidentWorkOrder"
  FOR EACH ROW EXECUTE FUNCTION "enforce_ir_work_order_boundary"();

CREATE FUNCTION "enforce_incident_consumption_boundary"() RETURNS trigger AS $$
BEGIN
  PERFORM 1 FROM "IncidentWorkOrder" work_order
  WHERE work_order."id" = NEW."work_order_id"
    AND work_order."tenant_id" = NEW."tenant_id"
    AND work_order."environment_id" = NEW."environment_id"
    AND work_order."status" IN ('ACTIVE', 'AWAITING_CUSTOMER', 'CONTAINMENT', 'RECOVERY');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'incident consumption requires a matching active work-order boundary';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "IncidentWorkOrderConsumption_boundary_guard"
  BEFORE INSERT ON "IncidentWorkOrderConsumption"
  FOR EACH ROW EXECUTE FUNCTION "enforce_incident_consumption_boundary"();

CREATE FUNCTION "enforce_third_party_cost_boundary"() RETURNS trigger AS $$
DECLARE
  cost_policy JSONB;
BEGIN
  SELECT retainer."third_party_cost_policy"::jsonb INTO cost_policy
  FROM "IncidentWorkOrder" work_order
  JOIN "IncidentResponseRetainer" retainer ON retainer."id" = work_order."retainer_id"
  WHERE work_order."id" = NEW."work_order_id"
    AND work_order."tenant_id" = NEW."tenant_id"
    AND work_order."environment_id" = NEW."environment_id";
  IF cost_policy IS NULL OR cost_policy->>'enabled' <> 'true' OR
     cost_policy->>'requiresNamedApproval' <> 'true' OR
     cost_policy->>'contractReference' <> NEW."contract_policy_reference" OR
     cost_policy->>'maxMarkupPercent' IS NULL OR
     (cost_policy->>'maxMarkupPercent')::numeric < NEW."markup_percent" THEN
    RAISE EXCEPTION 'third-party cost is outside the contracted work-order boundary';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id" OR
    NEW."environment_id" IS DISTINCT FROM OLD."environment_id" OR
    NEW."work_order_id" IS DISTINCT FROM OLD."work_order_id" OR
    NEW."cost_type" IS DISTINCT FROM OLD."cost_type" OR
    NEW."supplier_reference" IS DISTINCT FROM OLD."supplier_reference" OR
    NEW."contract_policy_reference" IS DISTINCT FROM OLD."contract_policy_reference" OR
    NEW."description" IS DISTINCT FROM OLD."description" OR
    NEW."base_amount" IS DISTINCT FROM OLD."base_amount" OR
    NEW."markup_percent" IS DISTINCT FROM OLD."markup_percent" OR
    NEW."customer_amount" IS DISTINCT FROM OLD."customer_amount" OR
    NEW."currency" IS DISTINCT FROM OLD."currency" OR
    NEW."named_customer_authorizer" IS DISTINCT FROM OLD."named_customer_authorizer" OR
    NEW."customer_approval_reference" IS DISTINCT FROM OLD."customer_approval_reference" OR
    NEW."requested_by" IS DISTINCT FROM OLD."requested_by" OR
    NEW."evidence_refs" IS DISTINCT FROM OLD."evidence_refs" OR
    NEW."incurred_at" IS DISTINCT FROM OLD."incurred_at"
  ) THEN
    RAISE EXCEPTION 'third-party cost scope and economics are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ThirdPartyPassThroughCost_boundary_guard"
  BEFORE INSERT OR UPDATE ON "ThirdPartyPassThroughCost"
  FOR EACH ROW EXECUTE FUNCTION "enforce_third_party_cost_boundary"();

CREATE FUNCTION "enforce_incident_legal_conclusion"() RETURNS trigger AS $$
DECLARE
  legal_scope JSONB;
BEGIN
  SELECT retainer."legal_service_scope"::jsonb INTO legal_scope
  FROM "IncidentWorkOrder" work_order
  JOIN "IncidentResponseRetainer" retainer ON retainer."id" = work_order."retainer_id"
  WHERE work_order."id" = NEW."work_order_id"
    AND work_order."tenant_id" = NEW."tenant_id"
    AND work_order."environment_id" = NEW."environment_id";
  IF legal_scope IS NULL THEN
    RAISE EXCEPTION 'legal-sensitive record requires a matching work-order boundary';
  END IF;
  IF NEW."counsel_controlled" OR NEW."privilege_status" = 'COUNSEL_ASSERTED' OR
     NEW."notification_status" = 'COUNSEL_DETERMINED' THEN
    IF NOT NEW."counsel_controlled" OR
       NULLIF(BTRIM(NEW."separate_legal_service_ref"), '') IS NULL OR
       NULLIF(BTRIM(NEW."counsel_actor_ref"), '') IS NULL THEN
      RAISE EXCEPTION 'counsel control requires separately contracted legal-service references';
    END IF;
    IF legal_scope->>'included' <> 'true' OR
       legal_scope->>'counselControlled' <> 'true' OR
       legal_scope->>'contractReference' <> NEW."separate_legal_service_ref" THEN
      RAISE EXCEPTION 'legal conclusion is outside separately contracted counsel-controlled scope';
    END IF;
  END IF;
  IF (NEW."privilege_status" = 'COUNSEL_ASSERTED' OR
      NEW."notification_status" = 'COUNSEL_DETERMINED') AND
     NULLIF(BTRIM(NEW."conclusion_reference"), '') IS NULL THEN
    RAISE EXCEPTION 'legal conclusions require a counsel conclusion reference';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "IncidentLegalSensitiveRecord_conclusion_guard"
  BEFORE INSERT ON "IncidentLegalSensitiveRecord"
  FOR EACH ROW EXECUTE FUNCTION "enforce_incident_legal_conclusion"();

CREATE FUNCTION "enforce_incident_legal_access_boundary"() RETURNS trigger AS $$
BEGIN
  PERFORM 1 FROM "IncidentLegalSensitiveRecord" legal_record
  WHERE legal_record."id" = NEW."legal_record_id"
    AND legal_record."tenant_id" = NEW."tenant_id"
    AND legal_record."environment_id" = NEW."environment_id"
    AND legal_record."purpose" = NEW."purpose";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'legal-sensitive access requires a matching record boundary and purpose';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "IncidentLegalAccessEvent_boundary_guard"
  BEFORE INSERT ON "IncidentLegalAccessEvent"
  FOR EACH ROW EXECUTE FUNCTION "enforce_incident_legal_access_boundary"();

CREATE FUNCTION "reject_incident_append_only_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'incident evidence and access records are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "IncidentWorkOrderConsumption_no_update"
  BEFORE UPDATE ON "IncidentWorkOrderConsumption"
  FOR EACH ROW EXECUTE FUNCTION "reject_incident_append_only_mutation"();
CREATE TRIGGER "IncidentWorkOrderConsumption_no_delete"
  BEFORE DELETE ON "IncidentWorkOrderConsumption"
  FOR EACH ROW EXECUTE FUNCTION "reject_incident_append_only_mutation"();
CREATE TRIGGER "IncidentLegalSensitiveRecord_no_update"
  BEFORE UPDATE ON "IncidentLegalSensitiveRecord"
  FOR EACH ROW EXECUTE FUNCTION "reject_incident_append_only_mutation"();
CREATE TRIGGER "IncidentLegalSensitiveRecord_no_delete"
  BEFORE DELETE ON "IncidentLegalSensitiveRecord"
  FOR EACH ROW EXECUTE FUNCTION "reject_incident_append_only_mutation"();
CREATE TRIGGER "IncidentLegalAccessEvent_no_update"
  BEFORE UPDATE ON "IncidentLegalAccessEvent"
  FOR EACH ROW EXECUTE FUNCTION "reject_incident_append_only_mutation"();
CREATE TRIGGER "IncidentLegalAccessEvent_no_delete"
  BEFORE DELETE ON "IncidentLegalAccessEvent"
  FOR EACH ROW EXECUTE FUNCTION "reject_incident_append_only_mutation"();
