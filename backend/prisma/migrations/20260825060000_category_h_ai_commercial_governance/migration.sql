-- Category H batch 1: governed AI entitlement/configuration, provider policy,
-- internal cost allocation, contract-derived metering and customer visibility.
-- This migration is intentionally generated but not auto-applied.

CREATE TABLE "AiGovernanceProfile" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "commercial_account_id" TEXT NOT NULL,
  "contract_id" TEXT NOT NULL,
  "price_book_id" TEXT NOT NULL,
  "profile_key" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "plan_sku" TEXT NOT NULL,
  "tenant_enabled" BOOLEAN NOT NULL DEFAULT false,
  "allowed_use_case_keys" TEXT NOT NULL DEFAULT '[]',
  "allowed_regions" TEXT NOT NULL DEFAULT '[]',
  "allowed_model_profile_ids" TEXT NOT NULL DEFAULT '[]',
  "billable_metric" TEXT NOT NULL DEFAULT 'NON_BILLABLE',
  "meter_key" TEXT,
  "usage_authorization_id" TEXT,
  "catalog_version_id" TEXT NOT NULL,
  "customer_authorization_ref" TEXT,
  "included_allowance" DECIMAL(14,4) NOT NULL,
  "warning_threshold_percent" INTEGER NOT NULL DEFAULT 80,
  "overage_policy" TEXT NOT NULL DEFAULT 'BLOCK',
  "overage_cap" DECIMAL(14,4),
  "rate_limit_at_percent" INTEGER NOT NULL DEFAULT 100,
  "fallback_allowed" BOOLEAN NOT NULL DEFAULT false,
  "fallback_model_profile_ids" TEXT NOT NULL DEFAULT '[]',
  "fallback_customer_charge_allowed" BOOLEAN NOT NULL DEFAULT false,
  "fallback_authorization_ref" TEXT,
  "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effective_to" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  "approval_id" TEXT,
  "requested_by" TEXT NOT NULL,
  "approved_by" TEXT,
  "approved_at" TIMESTAMP(3),
  "activated_by" TEXT,
  "activation_reference" TEXT,
  "activated_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiGovernanceProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiGovernanceProfile_json_check" CHECK (
    jsonb_typeof("allowed_use_case_keys"::jsonb) = 'array' AND
    jsonb_array_length("allowed_use_case_keys"::jsonb) > 0 AND
    jsonb_typeof("allowed_regions"::jsonb) = 'array' AND
    jsonb_array_length("allowed_regions"::jsonb) > 0 AND
    jsonb_typeof("allowed_model_profile_ids"::jsonb) = 'array' AND
    jsonb_array_length("allowed_model_profile_ids"::jsonb) > 0 AND
    jsonb_typeof("fallback_model_profile_ids"::jsonb) = 'array'
  ),
  CONSTRAINT "AiGovernanceProfile_metric_check" CHECK (
    "billable_metric" IN (
      'NON_BILLABLE', 'INCLUDED_CAPACITY', 'WORKFLOW_CLASS',
      'MODEL_CLASS', 'CONTRACTED_USAGE'
    ) AND
    ("billable_metric" = 'NON_BILLABLE' OR (
      NULLIF(BTRIM("meter_key"), '') IS NOT NULL AND
      NULLIF(BTRIM("catalog_version_id"), '') IS NOT NULL AND
      NULLIF(BTRIM("customer_authorization_ref"), '') IS NOT NULL
    )) AND
    ("billable_metric" <> 'NON_BILLABLE' OR
      ("meter_key" IS NULL AND "usage_authorization_id" IS NULL))
  ),
  CONSTRAINT "AiGovernanceProfile_allowance_check" CHECK (
    "included_allowance" > 0 AND
    "warning_threshold_percent" BETWEEN 1 AND 100 AND
    "rate_limit_at_percent" BETWEEN 1 AND 100 AND
    "overage_policy" IN ('BLOCK', 'RATE_LIMIT', 'DEGRADE', 'CONTRACT_AUTHORIZED') AND
    ("overage_policy" <> 'CONTRACT_AUTHORIZED' OR
      ("usage_authorization_id" IS NOT NULL AND "overage_cap" > 0)) AND
    ("overage_policy" = 'CONTRACT_AUTHORIZED' OR "overage_cap" IS NULL)
  ),
  CONSTRAINT "AiGovernanceProfile_fallback_check" CHECK (
    ("fallback_allowed" OR "fallback_model_profile_ids" = '[]') AND
    (NOT "fallback_customer_charge_allowed" OR
      ("fallback_allowed" AND NULLIF(BTRIM("fallback_authorization_ref"), '') IS NOT NULL))
  ),
  CONSTRAINT "AiGovernanceProfile_term_check" CHECK (
    "effective_to" IS NULL OR "effective_to" > "effective_from"
  ),
  CONSTRAINT "AiGovernanceProfile_status_check" CHECK (
    "status" IN ('PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'REJECTED', 'SUSPENDED', 'ENDED')
  ),
  CONSTRAINT "AiGovernanceProfile_approval_check" CHECK (
    "status" NOT IN ('APPROVED', 'ACTIVE') OR
    ("approval_id" IS NOT NULL AND NULLIF(BTRIM("approved_by"), '') IS NOT NULL AND "approved_at" IS NOT NULL)
  ),
  CONSTRAINT "AiGovernanceProfile_activation_check" CHECK (
    "status" <> 'ACTIVE' OR
    ("tenant_enabled" AND NULLIF(BTRIM("activated_by"), '') IS NOT NULL AND
     NULLIF(BTRIM("activation_reference"), '') IS NOT NULL AND "activated_at" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "AiGovernanceProfile_approval_id_key"
  ON "AiGovernanceProfile"("approval_id");
CREATE UNIQUE INDEX "AiGovernanceProfile_tenant_id_environment_id_profile_key_ve_key"
  ON "AiGovernanceProfile"("tenant_id", "environment_id", "profile_key", "version");
CREATE UNIQUE INDEX "AiGovernanceProfile_one_active_key"
  ON "AiGovernanceProfile"("tenant_id", "environment_id", "profile_key")
  WHERE "status" = 'ACTIVE';
CREATE INDEX "AiGovernanceProfile_tenant_id_environment_id_status_idx"
  ON "AiGovernanceProfile"("tenant_id", "environment_id", "status");
CREATE INDEX "AiGovernanceProfile_commercial_account_id_status_idx"
  ON "AiGovernanceProfile"("commercial_account_id", "status");
CREATE INDEX "AiGovernanceProfile_contract_id_status_idx"
  ON "AiGovernanceProfile"("contract_id", "status");
ALTER TABLE "AiGovernanceProfile" ADD CONSTRAINT "AiGovernanceProfile_commercial_account_id_fkey"
  FOREIGN KEY ("commercial_account_id") REFERENCES "CommercialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiGovernanceProfile" ADD CONSTRAINT "AiGovernanceProfile_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiGovernanceProfile" ADD CONSTRAINT "AiGovernanceProfile_price_book_id_fkey"
  FOREIGN KEY ("price_book_id") REFERENCES "PriceBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AiUsageRecord"
  ADD COLUMN "environment_id" TEXT NOT NULL DEFAULT 'UNBOUND',
  ADD COLUMN "governance_profile_id" TEXT,
  ADD COLUMN "use_case_key" TEXT NOT NULL DEFAULT 'LEGACY_UNBOUND',
  ADD COLUMN "workflow_class" TEXT NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN "model_profile_id" TEXT,
  ADD COLUMN "model_class" TEXT NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN "retrieval_units" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "ai_storage_byte_hours" DECIMAL(20,4) NOT NULL DEFAULT 0,
  ADD COLUMN "contracted_usage_units" DECIMAL(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN "complexity_units" DECIMAL(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN "internal_cost_source" TEXT NOT NULL DEFAULT 'CALLER_REPORTED',
  ADD COLUMN "provider_price_version" TEXT,
  ADD COLUMN "fallback_used" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "fallback_from_model_profile_id" TEXT,
  ADD COLUMN "billing_classification" TEXT NOT NULL DEFAULT 'INTERNAL_COST_ONLY',
  ADD COLUMN "billable_quantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN "catalog_version_id" TEXT,
  ADD COLUMN "customer_authorization_ref" TEXT;
DROP INDEX "AiUsageRecord_tenant_id_idx";
CREATE INDEX "AiUsageRecord_tenant_id_environment_id_occurred_at_idx"
  ON "AiUsageRecord"("tenant_id", "environment_id", "occurred_at");
CREATE INDEX "AiUsageRecord_governance_profile_id_occurred_at_idx"
  ON "AiUsageRecord"("governance_profile_id", "occurred_at");
ALTER TABLE "AiUsageRecord" ADD CONSTRAINT "AiUsageRecord_governance_profile_id_fkey"
  FOREIGN KEY ("governance_profile_id") REFERENCES "AiGovernanceProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiUsageRecord" ADD CONSTRAINT "AiUsageRecord_nonnegative_check" CHECK (
  "input_tokens" >= 0 AND "output_tokens" >= 0 AND "tool_calls" >= 0 AND
  "retrieval_calls" >= 0 AND "retrieval_units" >= 0 AND
  "ai_storage_byte_hours" >= 0 AND "contracted_usage_units" >= 0 AND
  "complexity_units" >= 0 AND "internal_cost" >= 0 AND "billable_quantity" >= 0
);
ALTER TABLE "AiUsageRecord" ADD CONSTRAINT "AiUsageRecord_fallback_check" CHECK (
  ("fallback_used" AND NULLIF(BTRIM("fallback_from_model_profile_id"), '') IS NOT NULL) OR
  (NOT "fallback_used" AND "fallback_from_model_profile_id" IS NULL)
);
ALTER TABLE "AiUsageRecord" ADD CONSTRAINT "AiUsageRecord_billable_check" CHECK (
  (NOT "billable" AND "billable_quantity" = 0) OR
  ("billable" AND "billable_quantity" > 0 AND "meter_event_id" IS NOT NULL AND
   "billing_classification" = 'CONTRACT_METER_AUTHORIZED')
);

CREATE TABLE "AiProviderCostEvent" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT,
  "environment_id" TEXT,
  "governance_profile_id" TEXT,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "model_class" TEXT NOT NULL,
  "provider_price_version" TEXT NOT NULL,
  "prior_unit_cost" DECIMAL(14,6),
  "new_unit_cost" DECIMAL(14,6) NOT NULL,
  "cost_unit" TEXT NOT NULL,
  "effective_at" TIMESTAMP(3) NOT NULL,
  "source_reference" TEXT NOT NULL,
  "customer_price_changed" BOOLEAN NOT NULL DEFAULT false,
  "recorded_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiProviderCostEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiProviderCostEvent_cost_check" CHECK (
    ("prior_unit_cost" IS NULL OR "prior_unit_cost" >= 0) AND "new_unit_cost" >= 0
  ),
  CONSTRAINT "AiProviderCostEvent_no_customer_price_change" CHECK (NOT "customer_price_changed")
);
CREATE UNIQUE INDEX "AiProviderCostEvent_provider_model_provider_price_version_e_key"
  ON "AiProviderCostEvent"("provider", "model", "provider_price_version", "effective_at");
CREATE INDEX "AiProviderCostEvent_tenant_id_environment_id_effective_at_idx"
  ON "AiProviderCostEvent"("tenant_id", "environment_id", "effective_at");
CREATE INDEX "AiProviderCostEvent_governance_profile_id_effective_at_idx"
  ON "AiProviderCostEvent"("governance_profile_id", "effective_at");
CREATE INDEX "AiProviderCostEvent_provider_model_effective_at_idx"
  ON "AiProviderCostEvent"("provider", "model", "effective_at");
ALTER TABLE "AiProviderCostEvent" ADD CONSTRAINT "AiProviderCostEvent_governance_profile_id_fkey"
  FOREIGN KEY ("governance_profile_id") REFERENCES "AiGovernanceProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiBudget" ADD COLUMN "environment_id" TEXT NOT NULL DEFAULT 'UNBOUND';
DROP INDEX "AiBudget_tenant_id_idx";
CREATE INDEX "AiBudget_tenant_id_environment_id_idx"
  ON "AiBudget"("tenant_id", "environment_id");
ALTER TABLE "AiBudget" ADD CONSTRAINT "AiBudget_period_amount_check" CHECK (
  "period_end" > "period_start" AND "budget_amount" > 0 AND
  "consumed_amount" >= 0 AND "status" IN ('ACTIVE', 'EXHAUSTED', 'CANCELLED')
);
CREATE UNIQUE INDEX "AiBudget_one_active_period"
  ON "AiBudget"("tenant_id", "environment_id", "period_start", "period_end")
  WHERE "status" = 'ACTIVE';

CREATE FUNCTION "enforce_ai_governance_profile_boundary"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."status" IN ('APPROVED', 'ACTIVE') AND (
    OLD."tenant_id" IS DISTINCT FROM NEW."tenant_id" OR
    OLD."environment_id" IS DISTINCT FROM NEW."environment_id" OR
    OLD."commercial_account_id" IS DISTINCT FROM NEW."commercial_account_id" OR
    OLD."contract_id" IS DISTINCT FROM NEW."contract_id" OR
    OLD."price_book_id" IS DISTINCT FROM NEW."price_book_id" OR
    OLD."profile_key" IS DISTINCT FROM NEW."profile_key" OR
    OLD."version" IS DISTINCT FROM NEW."version" OR
    OLD."plan_sku" IS DISTINCT FROM NEW."plan_sku" OR
    OLD."allowed_use_case_keys" IS DISTINCT FROM NEW."allowed_use_case_keys" OR
    OLD."allowed_regions" IS DISTINCT FROM NEW."allowed_regions" OR
    OLD."allowed_model_profile_ids" IS DISTINCT FROM NEW."allowed_model_profile_ids" OR
    OLD."billable_metric" IS DISTINCT FROM NEW."billable_metric" OR
    OLD."meter_key" IS DISTINCT FROM NEW."meter_key" OR
    OLD."usage_authorization_id" IS DISTINCT FROM NEW."usage_authorization_id" OR
    OLD."catalog_version_id" IS DISTINCT FROM NEW."catalog_version_id" OR
    OLD."customer_authorization_ref" IS DISTINCT FROM NEW."customer_authorization_ref" OR
    OLD."included_allowance" IS DISTINCT FROM NEW."included_allowance" OR
    OLD."overage_policy" IS DISTINCT FROM NEW."overage_policy" OR
    OLD."overage_cap" IS DISTINCT FROM NEW."overage_cap" OR
    OLD."fallback_allowed" IS DISTINCT FROM NEW."fallback_allowed" OR
    OLD."fallback_model_profile_ids" IS DISTINCT FROM NEW."fallback_model_profile_ids" OR
    OLD."fallback_customer_charge_allowed" IS DISTINCT FROM NEW."fallback_customer_charge_allowed" OR
    OLD."fallback_authorization_ref" IS DISTINCT FROM NEW."fallback_authorization_ref"
  ) THEN
    RAISE EXCEPTION 'approved AI commercial and provider policy is immutable; create a new version';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."activated_at" IS NOT NULL AND (
    OLD."activated_by" IS DISTINCT FROM NEW."activated_by" OR
    OLD."activation_reference" IS DISTINCT FROM NEW."activation_reference" OR
    OLD."activated_at" IS DISTINCT FROM NEW."activated_at"
  ) THEN
    RAISE EXCEPTION 'AI activation evidence is immutable';
  END IF;

  IF NEW."status" IN ('APPROVED', 'ACTIVE') THEN
    PERFORM 1 FROM "CommercialApproval" approval
    WHERE approval."id" = NEW."approval_id"
      AND approval."tenant_id" = NEW."tenant_id"
      AND approval."object_type" = 'AiGovernanceProfile'
      AND approval."object_id" = NEW."id"
      AND approval."change_type" = 'AI_GOVERNANCE_PROFILE'
      AND approval."status" IN ('APPROVED', 'APPLIED');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'approved AI governance profile requires matching maker-checker approval';
    END IF;
  END IF;

  IF NEW."status" = 'ACTIVE' THEN
    PERFORM 1
    FROM "Contract" contract
    JOIN "CommercialAccount" account
      ON account."id" = NEW."commercial_account_id"
     AND account."status" NOT IN ('SUSPENDED', 'TERMINATED')
    JOIN "PriceBook" price_book ON price_book."id" = NEW."price_book_id"
    JOIN "Product" product ON product."id" = price_book."product_id"
    JOIN "CatalogVersion" catalog ON catalog."id" = NEW."catalog_version_id"
    JOIN "CommercialAccountTenantBinding" binding
      ON binding."commercial_account_id" = NEW."commercial_account_id"
     AND binding."tenant_id" = NEW."tenant_id"
     AND binding."environment_id" = NEW."environment_id"
     AND binding."status" = 'ACTIVE'
    JOIN "Entitlement" entitlement
      ON entitlement."commercial_account_id" = NEW."commercial_account_id"
     AND entitlement."tenant_id" = NEW."tenant_id"
     AND entitlement."offer_type" = 'AI_SECURITY'
     AND entitlement."status" = 'ACTIVE'
    WHERE contract."id" = NEW."contract_id"
      AND contract."commercial_account_id" = NEW."commercial_account_id"
      AND contract."catalog_version_id" = NEW."catalog_version_id"
      AND contract."status" = 'ACTIVE'
      AND NEW."effective_from" >= contract."term_start"
      AND COALESCE(NEW."effective_to", contract."term_end") <= contract."term_end"
      AND price_book."catalog_version_id" = NEW."catalog_version_id"
      AND price_book."status" = 'ACTIVE'
      AND (NEW."billable_metric" = 'NON_BILLABLE' OR
        (price_book."margin_gate_passed" AND price_book."approval_id" IS NOT NULL AND
         price_book."public_disclosure_approved"))
      AND product."sku" = NEW."plan_sku"
      AND product."offer_family" = 'AI_SECURITY'
      AND product."release_status" = 'RELEASED'
      AND catalog."status" = 'APPROVED'
      AND CURRENT_TIMESTAMP BETWEEN binding."effective_from" AND COALESCE(binding."effective_to", CURRENT_TIMESTAMP)
      AND CURRENT_TIMESTAMP BETWEEN entitlement."effective_from" AND COALESCE(entitlement."effective_to", CURRENT_TIMESTAMP);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'AI activation requires matching active entitlement, binding, contract, approved catalog and released plan SKU';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "AiGovernanceProfile_boundary_guard"
  BEFORE INSERT OR UPDATE ON "AiGovernanceProfile"
  FOR EACH ROW EXECUTE FUNCTION "enforce_ai_governance_profile_boundary"();

CREATE FUNCTION "enforce_ai_usage_governance"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW."governance_profile_id" IS NOT NULL THEN
    PERFORM 1
    FROM "AiGovernanceProfile" profile
    JOIN "ModelProfile" model_profile ON model_profile."id" = NEW."model_profile_id"
    WHERE profile."id" = NEW."governance_profile_id"
      AND profile."tenant_id" = NEW."tenant_id"
      AND profile."environment_id" = NEW."environment_id"
      AND profile."status" = 'ACTIVE'
      AND profile."tenant_enabled"
      AND profile."allowed_use_case_keys"::jsonb ? NEW."use_case_key"
      AND model_profile."provider" = NEW."provider"
      AND model_profile."model" = NEW."model"
      AND model_profile."status" = 'ACTIVE'
      AND (
        (NOT NEW."fallback_used" AND profile."allowed_model_profile_ids"::jsonb ? NEW."model_profile_id") OR
        (NEW."fallback_used" AND profile."fallback_allowed" AND profile."fallback_model_profile_ids"::jsonb ? NEW."model_profile_id")
      );
    IF NOT FOUND THEN
      RAISE EXCEPTION 'AI usage requires matching active tenant profile, use case and provider policy';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND (
    OLD."tenant_id" IS DISTINCT FROM NEW."tenant_id" OR
    OLD."environment_id" IS DISTINCT FROM NEW."environment_id" OR
    OLD."governance_profile_id" IS DISTINCT FROM NEW."governance_profile_id" OR
    OLD."use_case_key" IS DISTINCT FROM NEW."use_case_key" OR
    OLD."workflow" IS DISTINCT FROM NEW."workflow" OR
    OLD."workflow_class" IS DISTINCT FROM NEW."workflow_class" OR
    OLD."provider" IS DISTINCT FROM NEW."provider" OR
    OLD."model" IS DISTINCT FROM NEW."model" OR
    OLD."model_profile_id" IS DISTINCT FROM NEW."model_profile_id" OR
    OLD."model_class" IS DISTINCT FROM NEW."model_class" OR
    OLD."input_tokens" IS DISTINCT FROM NEW."input_tokens" OR
    OLD."output_tokens" IS DISTINCT FROM NEW."output_tokens" OR
    OLD."tool_calls" IS DISTINCT FROM NEW."tool_calls" OR
    OLD."retrieval_calls" IS DISTINCT FROM NEW."retrieval_calls" OR
    OLD."retrieval_units" IS DISTINCT FROM NEW."retrieval_units" OR
    OLD."ai_storage_byte_hours" IS DISTINCT FROM NEW."ai_storage_byte_hours" OR
    OLD."contracted_usage_units" IS DISTINCT FROM NEW."contracted_usage_units" OR
    OLD."complexity_units" IS DISTINCT FROM NEW."complexity_units" OR
    OLD."internal_cost" IS DISTINCT FROM NEW."internal_cost" OR
    OLD."internal_cost_source" IS DISTINCT FROM NEW."internal_cost_source" OR
    OLD."provider_price_version" IS DISTINCT FROM NEW."provider_price_version" OR
    OLD."fallback_used" IS DISTINCT FROM NEW."fallback_used" OR
    OLD."fallback_from_model_profile_id" IS DISTINCT FROM NEW."fallback_from_model_profile_id" OR
    OLD."catalog_version_id" IS DISTINCT FROM NEW."catalog_version_id" OR
    OLD."customer_authorization_ref" IS DISTINCT FROM NEW."customer_authorization_ref" OR
    OLD."occurred_at" IS DISTINCT FROM NEW."occurred_at"
  ) THEN
    RAISE EXCEPTION 'AI cost and attribution evidence is immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND (OLD."billable" OR NOT NEW."billable") THEN
    RAISE EXCEPTION 'AI billing decision permits only one non-billable to billable transition';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "AiUsageRecord_governance_guard"
  BEFORE INSERT OR UPDATE ON "AiUsageRecord"
  FOR EACH ROW EXECUTE FUNCTION "enforce_ai_usage_governance"();

CREATE FUNCTION "reject_ai_cost_event_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AI provider cost events are append-only and cannot change customer prices';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "AiProviderCostEvent_no_update"
  BEFORE UPDATE ON "AiProviderCostEvent"
  FOR EACH ROW EXECUTE FUNCTION "reject_ai_cost_event_mutation"();
CREATE TRIGGER "AiProviderCostEvent_no_delete"
  BEFORE DELETE ON "AiProviderCostEvent"
  FOR EACH ROW EXECUTE FUNCTION "reject_ai_cost_event_mutation"();
