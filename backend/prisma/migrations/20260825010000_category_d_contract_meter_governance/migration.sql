-- Category D: contract-authorized metering, immutable corrections/exports,
-- customer-authorized paid operations and customer-visible usage forecasts.

ALTER TABLE "MeterDefinition"
  ADD COLUMN "validation_rules" TEXT NOT NULL DEFAULT '{}',
  ADD COLUMN "correction_policy" TEXT NOT NULL DEFAULT 'REVERSAL_REPLACEMENT_ADJUSTMENT',
  ADD COLUMN "requested_by" TEXT,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Legacy APPROVED meters have no mandatory source/validation contract and
-- therefore cannot remain billing-authoritative after this migration.
UPDATE "MeterDefinition"
SET "status" = 'MIGRATION_REVIEW'
WHERE "status" = 'APPROVED';

CREATE TABLE "MeterAuthorizationPolicy" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "commercial_account_id" TEXT NOT NULL,
  "contract_id" TEXT NOT NULL,
  "policy_key" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "meter_definition_id" TEXT NOT NULL,
  "price_book_id" TEXT,
  "authorized_source_scope" TEXT NOT NULL DEFAULT '[]',
  "usage_type" TEXT NOT NULL DEFAULT 'STANDARD',
  "billing_period" TEXT NOT NULL DEFAULT 'MONTHLY',
  "pricing_model" TEXT NOT NULL DEFAULT 'USAGE',
  "included_quantity" INTEGER NOT NULL DEFAULT 0,
  "committed_quantity" INTEGER,
  "warning_thresholds" TEXT NOT NULL DEFAULT '[]',
  "overage_behavior" TEXT NOT NULL DEFAULT 'NO_OVERAGE',
  "cap_quantity" INTEGER,
  "overage_rate" DECIMAL(14,6),
  "criticality" TEXT NOT NULL DEFAULT 'CRITICAL_SECURITY',
  "requires_usage_authorization" BOOLEAN NOT NULL DEFAULT false,
  "visible_customer_policy" TEXT NOT NULL DEFAULT '{}',
  "retention_policy" TEXT NOT NULL DEFAULT '{}',
  "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effective_to" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  "approval_id" TEXT,
  "requested_by" TEXT NOT NULL,
  "approved_by" TEXT,
  "approved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MeterAuthorizationPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MeterAuthorizationPolicy_nonnegative_quantities_check" CHECK (
    "included_quantity" >= 0 AND
    ("committed_quantity" IS NULL OR "committed_quantity" > 0) AND
    ("cap_quantity" IS NULL OR "cap_quantity" > 0)
  ),
  CONSTRAINT "MeterAuthorizationPolicy_effective_window_check" CHECK (
    "effective_to" IS NULL OR "effective_to" > "effective_from"
  )
);
CREATE UNIQUE INDEX "MeterAuthorizationPolicy_approval_id_key"
  ON "MeterAuthorizationPolicy"("approval_id");
CREATE UNIQUE INDEX "MeterAuthorizationPolicy_tenant_id_environment_id_policy_key_version_key"
  ON "MeterAuthorizationPolicy"("tenant_id", "environment_id", "policy_key", "version");
CREATE INDEX "MeterAuthorizationPolicy_tenant_id_environment_id_status_idx"
  ON "MeterAuthorizationPolicy"("tenant_id", "environment_id", "status");
CREATE INDEX "MeterAuthorizationPolicy_contract_id_status_idx"
  ON "MeterAuthorizationPolicy"("contract_id", "status");
CREATE INDEX "MeterAuthorizationPolicy_meter_definition_id_status_idx"
  ON "MeterAuthorizationPolicy"("meter_definition_id", "status");
CREATE INDEX "MeterAuthorizationPolicy_effective_from_effective_to_status_idx"
  ON "MeterAuthorizationPolicy"("effective_from", "effective_to", "status");

CREATE TABLE "MeterUsageAuthorization" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "meter_authorization_id" TEXT NOT NULL,
  "authorization_type" TEXT NOT NULL,
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "max_quantity" INTEGER,
  "reason" TEXT NOT NULL,
  "customer_reference" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  "approval_id" TEXT,
  "requested_by" TEXT NOT NULL,
  "approved_by" TEXT,
  "approved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MeterUsageAuthorization_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MeterUsageAuthorization_period_check" CHECK ("period_end" > "period_start"),
  CONSTRAINT "MeterUsageAuthorization_quantity_check" CHECK (
    "max_quantity" IS NULL OR "max_quantity" > 0
  )
);
CREATE UNIQUE INDEX "MeterUsageAuthorization_approval_id_key"
  ON "MeterUsageAuthorization"("approval_id");
CREATE INDEX "MeterUsageAuthorization_tenant_id_environment_id_status_idx"
  ON "MeterUsageAuthorization"("tenant_id", "environment_id", "status");
CREATE INDEX "MeterUsageAuthorization_meter_authorization_id_status_perio_idx"
  ON "MeterUsageAuthorization"("meter_authorization_id", "status", "period_start", "period_end");

ALTER TABLE "MeterEvent"
  ADD COLUMN "environment_id" TEXT NOT NULL DEFAULT 'UNBOUND',
  ADD COLUMN "meter_authorization_id" TEXT,
  ADD COLUMN "usage_authorization_id" TEXT,
  ADD COLUMN "contract_id" TEXT,
  ADD COLUMN "validation_state" TEXT NOT NULL DEFAULT 'MIGRATION_REVIEW',
  ADD COLUMN "validation_reason" TEXT,
  ADD COLUMN "dedupe_state" TEXT NOT NULL DEFAULT 'UNIQUE',
  ADD COLUMN "correction_type" TEXT NOT NULL DEFAULT 'ORIGINAL',
  ADD COLUMN "event_metadata" TEXT NOT NULL DEFAULT '{}',
  ADD COLUMN "immutable_hash" TEXT NOT NULL DEFAULT '';

UPDATE "MeterEvent"
SET
  "billable_state" = 'NON_BILLABLE',
  "validation_state" = 'MIGRATION_REVIEW',
  "validation_reason" = 'Legacy event has no approved Category D contract meter authorization',
  "immutable_hash" = 'MIGRATION_REVIEW:' || "id";

CREATE INDEX "MeterEvent_tenant_id_environment_id_occurred_at_idx"
  ON "MeterEvent"("tenant_id", "environment_id", "occurred_at");
CREATE INDEX "MeterEvent_meter_authorization_id_occurred_at_idx"
  ON "MeterEvent"("meter_authorization_id", "occurred_at");
CREATE INDEX "MeterEvent_usage_authorization_id_idx"
  ON "MeterEvent"("usage_authorization_id");
CREATE INDEX "MeterEvent_correction_of_event_id_idx"
  ON "MeterEvent"("correction_of_event_id");
-- Prevent concurrent first-seen events from both increasing usage. Rejected,
-- quarantined and duplicate evidence remains appendable.
CREATE UNIQUE INDEX "MeterEvent_unique_accepted_original_dedupe_idx"
  ON "MeterEvent"("tenant_id", "environment_id", "meter_definition_id", "dedupe_key")
  WHERE "accepted_state" = 'ACCEPTED' AND "correction_type" = 'ORIGINAL';

ALTER TABLE "UsageRecord"
  ADD COLUMN "meter_definition_id" TEXT,
  ADD COLUMN "meter_authorization_id" TEXT,
  ADD COLUMN "usage_authorization_id" TEXT,
  ADD COLUMN "contract_id" TEXT,
  ADD COLUMN "overage_quantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "usage_classification" TEXT NOT NULL DEFAULT 'UNAUTHORIZED_NON_BILLABLE',
  ADD COLUMN "immutable_hash" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "UsageRecord"
SET
  "billable_quantity" = 0,
  "usage_state" = 'MIGRATION_REVIEW',
  "usage_classification" = 'LEGACY_UNAUTHORIZED_NON_BILLABLE',
  "immutable_hash" = 'MIGRATION_REVIEW:' || "id";

CREATE INDEX "UsageRecord_tenant_id_environment_id_meter_authorization_id_idx"
  ON "UsageRecord"("tenant_id", "environment_id", "meter_authorization_id", "occurred_at");
CREATE INDEX "UsageRecord_meter_definition_id_occurred_at_idx"
  ON "UsageRecord"("meter_definition_id", "occurred_at");
CREATE INDEX "UsageRecord_usage_authorization_id_idx"
  ON "UsageRecord"("usage_authorization_id");

CREATE TABLE "MeterThresholdEvent" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "meter_authorization_id" TEXT NOT NULL,
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "threshold_percent" INTEGER NOT NULL,
  "threshold_quantity" INTEGER NOT NULL,
  "current_quantity" INTEGER NOT NULL,
  "forecast_quantity" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MeterThresholdEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MeterThresholdEvent_threshold_check" CHECK (
    "threshold_percent" BETWEEN 1 AND 100 AND "threshold_quantity" > 0
  )
);
CREATE UNIQUE INDEX "MeterThresholdEvent_meter_authorization_id_period_start_threshold_percent_key"
  ON "MeterThresholdEvent"("meter_authorization_id", "period_start", "threshold_percent");
CREATE INDEX "MeterThresholdEvent_tenant_id_environment_id_status_idx"
  ON "MeterThresholdEvent"("tenant_id", "environment_id", "status");

CREATE TABLE "MeterCorrectionRequest" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "original_event_id" TEXT NOT NULL,
  "correction_type" TEXT NOT NULL,
  "replacement_quantity" INTEGER,
  "adjustment_quantity" INTEGER,
  "reason" TEXT NOT NULL,
  "evidence_refs" TEXT NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  "approval_id" TEXT,
  "requested_by" TEXT NOT NULL,
  "approved_by" TEXT,
  "approved_at" TIMESTAMP(3),
  "generated_event_ids" TEXT NOT NULL DEFAULT '[]',
  "applied_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MeterCorrectionRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MeterCorrectionRequest_approval_id_key"
  ON "MeterCorrectionRequest"("approval_id");
CREATE INDEX "MeterCorrectionRequest_tenant_id_environment_id_status_idx"
  ON "MeterCorrectionRequest"("tenant_id", "environment_id", "status");
CREATE INDEX "MeterCorrectionRequest_original_event_id_idx"
  ON "MeterCorrectionRequest"("original_event_id");

CREATE TABLE "MeterBillingExport" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "meter_authorization_id" TEXT NOT NULL,
  "contract_id" TEXT NOT NULL,
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "meter_definition_id" TEXT NOT NULL,
  "meter_version" INTEGER NOT NULL,
  "event_ids" TEXT NOT NULL DEFAULT '[]',
  "usage_record_ids" TEXT NOT NULL DEFAULT '[]',
  "accepted_quantity" INTEGER NOT NULL DEFAULT 0,
  "billable_quantity" INTEGER NOT NULL DEFAULT 0,
  "overage_quantity" INTEGER NOT NULL DEFAULT 0,
  "immutable_snapshot" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  "approval_id" TEXT,
  "reason" TEXT NOT NULL,
  "requested_by" TEXT NOT NULL,
  "approved_by" TEXT,
  "approved_at" TIMESTAMP(3),
  "supersedes_id" TEXT,
  "correction_request_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MeterBillingExport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MeterBillingExport_period_check" CHECK ("period_end" > "period_start")
);
CREATE UNIQUE INDEX "MeterBillingExport_approval_id_key"
  ON "MeterBillingExport"("approval_id");
CREATE INDEX "MeterBillingExport_tenant_id_environment_id_status_idx"
  ON "MeterBillingExport"("tenant_id", "environment_id", "status");
CREATE INDEX "MeterBillingExport_meter_authorization_id_period_start_period_end_idx"
  ON "MeterBillingExport"("meter_authorization_id", "period_start", "period_end");
CREATE INDEX "MeterBillingExport_contract_id_period_start_period_end_idx"
  ON "MeterBillingExport"("contract_id", "period_start", "period_end");
CREATE INDEX "MeterBillingExport_supersedes_id_idx"
  ON "MeterBillingExport"("supersedes_id");

ALTER TABLE "MeterAuthorizationPolicy"
  ADD CONSTRAINT "MeterAuthorizationPolicy_commercial_account_id_fkey"
  FOREIGN KEY ("commercial_account_id") REFERENCES "CommercialAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MeterAuthorizationPolicy"
  ADD CONSTRAINT "MeterAuthorizationPolicy_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "Contract"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MeterAuthorizationPolicy"
  ADD CONSTRAINT "MeterAuthorizationPolicy_meter_definition_id_fkey"
  FOREIGN KEY ("meter_definition_id") REFERENCES "MeterDefinition"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MeterUsageAuthorization"
  ADD CONSTRAINT "MeterUsageAuthorization_meter_authorization_id_fkey"
  FOREIGN KEY ("meter_authorization_id") REFERENCES "MeterAuthorizationPolicy"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MeterEvent"
  ADD CONSTRAINT "MeterEvent_meter_authorization_id_fkey"
  FOREIGN KEY ("meter_authorization_id") REFERENCES "MeterAuthorizationPolicy"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MeterEvent"
  ADD CONSTRAINT "MeterEvent_usage_authorization_id_fkey"
  FOREIGN KEY ("usage_authorization_id") REFERENCES "MeterUsageAuthorization"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MeterEvent"
  ADD CONSTRAINT "MeterEvent_correction_of_event_id_fkey"
  FOREIGN KEY ("correction_of_event_id") REFERENCES "MeterEvent"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UsageRecord"
  ADD CONSTRAINT "UsageRecord_meter_definition_id_fkey"
  FOREIGN KEY ("meter_definition_id") REFERENCES "MeterDefinition"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UsageRecord"
  ADD CONSTRAINT "UsageRecord_meter_authorization_id_fkey"
  FOREIGN KEY ("meter_authorization_id") REFERENCES "MeterAuthorizationPolicy"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UsageRecord"
  ADD CONSTRAINT "UsageRecord_usage_authorization_id_fkey"
  FOREIGN KEY ("usage_authorization_id") REFERENCES "MeterUsageAuthorization"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MeterThresholdEvent"
  ADD CONSTRAINT "MeterThresholdEvent_meter_authorization_id_fkey"
  FOREIGN KEY ("meter_authorization_id") REFERENCES "MeterAuthorizationPolicy"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MeterBillingExport"
  ADD CONSTRAINT "MeterBillingExport_meter_authorization_id_fkey"
  FOREIGN KEY ("meter_authorization_id") REFERENCES "MeterAuthorizationPolicy"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Evidence facts are append-only. Corrections are new MeterEvent/UsageRecord
-- rows and never updates to an accepted source row.
CREATE FUNCTION "reject_meter_evidence_update"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'meter evidence is immutable; append an approved correction';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "MeterEvent_immutable_update"
  BEFORE UPDATE ON "MeterEvent"
  FOR EACH ROW EXECUTE FUNCTION "reject_meter_evidence_update"();
CREATE TRIGGER "UsageRecord_immutable_update"
  BEFORE UPDATE ON "UsageRecord"
  FOR EACH ROW EXECUTE FUNCTION "reject_meter_evidence_update"();

CREATE FUNCTION "protect_meter_export_snapshot"() RETURNS trigger AS $$
BEGIN
  IF NEW."immutable_snapshot" IS DISTINCT FROM OLD."immutable_snapshot"
    OR NEW."checksum" IS DISTINCT FROM OLD."checksum"
    OR NEW."event_ids" IS DISTINCT FROM OLD."event_ids"
    OR NEW."usage_record_ids" IS DISTINCT FROM OLD."usage_record_ids"
    OR NEW."accepted_quantity" IS DISTINCT FROM OLD."accepted_quantity"
    OR NEW."billable_quantity" IS DISTINCT FROM OLD."billable_quantity"
    OR NEW."overage_quantity" IS DISTINCT FROM OLD."overage_quantity" THEN
    RAISE EXCEPTION 'meter billing export evidence snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "MeterBillingExport_protect_snapshot"
  BEFORE UPDATE ON "MeterBillingExport"
  FOR EACH ROW EXECUTE FUNCTION "protect_meter_export_snapshot"();
