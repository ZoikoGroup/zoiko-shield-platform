-- Category C: controlled protected-resource definitions, governed discovery
-- acceptance, authorized/capped auto-enrollment and immutable count previews.

ALTER TABLE "ProtectedResourceDefinition"
  ADD COLUMN "resource_family" TEXT NOT NULL DEFAULT 'ENDPOINT',
  ADD COLUMN "metric_family" TEXT NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "controlled_definition" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "counting_safeguard" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "counting_policy" TEXT NOT NULL DEFAULT '{}',
  ADD COLUMN "overlap_policy" TEXT NOT NULL DEFAULT '{}',
  ADD COLUMN "requested_by" TEXT;

-- Previously approved definitions do not carry the controlled Category C
-- taxonomy/safeguards. Quarantine them instead of guessing a metric family.
UPDATE "ProtectedResourceDefinition"
SET "status" = 'MIGRATION_REVIEW'
WHERE "status" = 'APPROVED';

ALTER TABLE "ResourceObservation"
  ADD COLUMN "resource_definition_id" TEXT,
  ADD COLUMN "physical_resource_id" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "identity_basis_hash" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "resource_family" TEXT NOT NULL DEFAULT 'ENDPOINT',
  ADD COLUMN "metric_family" TEXT NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "source_connectors" TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN "coverage_policy_id" TEXT,
  ADD COLUMN "decision_by" TEXT,
  ADD COLUMN "decision_reason" TEXT,
  ADD COLUMN "decided_at" TIMESTAMP(3),
  ADD COLUMN "auto_enrollment_status" TEXT NOT NULL DEFAULT 'NOT_ELIGIBLE';

UPDATE "ResourceObservation"
SET
  "physical_resource_id" = "canonical_resource_id",
  "identity_basis_hash" = "canonical_resource_id",
  "source_connectors" = json_build_array("source_connector_id")::text,
  "auto_enrollment_status" = 'MIGRATION_REVIEW';

DROP INDEX "ResourceObservation_tenant_id_canonical_resource_id_resourc_key";
CREATE UNIQUE INDEX "ResourceObservation_tenant_id_metric_family_canonical_resource_id_key"
  ON "ResourceObservation"("tenant_id", "metric_family", "canonical_resource_id");
CREATE INDEX "ResourceObservation_tenant_id_environment_id_metric_family_idx"
  ON "ResourceObservation"("tenant_id", "environment_id", "metric_family");
CREATE INDEX "ResourceObservation_tenant_id_physical_resource_id_idx"
  ON "ResourceObservation"("tenant_id", "physical_resource_id");
CREATE INDEX "ResourceObservation_coverage_policy_id_coverage_state_idx"
  ON "ResourceObservation"("coverage_policy_id", "coverage_state");

CREATE TABLE "ResourceCoveragePolicy" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "policy_key" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "resource_definition_id" TEXT NOT NULL,
  "resource_family" TEXT NOT NULL,
  "metric_family" TEXT NOT NULL,
  "meter_definition_id" TEXT NOT NULL,
  "coverage_outcome" TEXT NOT NULL DEFAULT 'COVERED',
  "aggregation_method" TEXT NOT NULL DEFAULT 'HIGH_WATER',
  "observation_window" TEXT NOT NULL DEFAULT 'MONTHLY',
  "minimum_duration_seconds" INTEGER NOT NULL DEFAULT 0,
  "committed_quantity" INTEGER,
  "auto_enroll" BOOLEAN NOT NULL DEFAULT false,
  "threshold_quantity" INTEGER,
  "cap_quantity" INTEGER,
  "notice_period_days" INTEGER,
  "notice_template" TEXT,
  "disclosed_metric_families" TEXT NOT NULL DEFAULT '[]',
  "disclosure_reference" TEXT,
  "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effective_to" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  "approval_id" TEXT,
  "requested_by" TEXT NOT NULL,
  "approved_by" TEXT,
  "approved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResourceCoveragePolicy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ResourceCoveragePolicy_approval_id_key"
  ON "ResourceCoveragePolicy"("approval_id");
CREATE UNIQUE INDEX "ResourceCoveragePolicy_tenant_id_environment_id_policy_key_version_key"
  ON "ResourceCoveragePolicy"("tenant_id", "environment_id", "policy_key", "version");
CREATE INDEX "ResourceCoveragePolicy_tenant_id_environment_id_status_idx"
  ON "ResourceCoveragePolicy"("tenant_id", "environment_id", "status");
CREATE INDEX "ResourceCoveragePolicy_resource_definition_id_status_idx"
  ON "ResourceCoveragePolicy"("resource_definition_id", "status");
CREATE INDEX "ResourceCoveragePolicy_meter_definition_id_status_idx"
  ON "ResourceCoveragePolicy"("meter_definition_id", "status");
CREATE INDEX "ResourceCoveragePolicy_effective_from_effective_to_status_idx"
  ON "ResourceCoveragePolicy"("effective_from", "effective_to", "status");

CREATE TABLE "ResourceObservationWindow" (
  "id" TEXT NOT NULL,
  "observation_id" TEXT NOT NULL,
  "source_connector_id" TEXT NOT NULL,
  "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "observed_from" TIMESTAMP(3) NOT NULL,
  "observed_to" TIMESTAMP(3) NOT NULL,
  "raw_basis_hash" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResourceObservationWindow_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ResourceObservationWindow_observation_id_observed_from_observed_to_idx"
  ON "ResourceObservationWindow"("observation_id", "observed_from", "observed_to");
CREATE INDEX "ResourceObservationWindow_observed_at_idx"
  ON "ResourceObservationWindow"("observed_at");

CREATE TABLE "ResourceCoverageDecision" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "observation_id" TEXT NOT NULL,
  "coverage_policy_id" TEXT,
  "from_state" TEXT NOT NULL,
  "to_state" TEXT NOT NULL,
  "decision_type" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResourceCoverageDecision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ResourceCoverageDecision_tenant_id_observation_id_decided_at_idx"
  ON "ResourceCoverageDecision"("tenant_id", "observation_id", "decided_at");
CREATE INDEX "ResourceCoverageDecision_coverage_policy_id_idx"
  ON "ResourceCoverageDecision"("coverage_policy_id");

CREATE TABLE "ResourceEnrollmentNotice" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "observation_id" TEXT NOT NULL,
  "coverage_policy_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_DELIVERY',
  "notice_reference" TEXT,
  "scheduled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "delivered_at" TIMESTAMP(3),
  "effective_at" TIMESTAMP(3),
  "applied_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "cancellation_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResourceEnrollmentNotice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ResourceEnrollmentNotice_observation_id_coverage_policy_id_key"
  ON "ResourceEnrollmentNotice"("observation_id", "coverage_policy_id");
CREATE INDEX "ResourceEnrollmentNotice_tenant_id_status_idx"
  ON "ResourceEnrollmentNotice"("tenant_id", "status");
CREATE INDEX "ResourceEnrollmentNotice_status_effective_at_idx"
  ON "ResourceEnrollmentNotice"("status", "effective_at");

CREATE TABLE "ResourceCountPreview" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "policy_ids" TEXT NOT NULL,
  "meter_versions" TEXT NOT NULL,
  "window_start" TIMESTAMP(3) NOT NULL,
  "window_end" TIMESTAMP(3) NOT NULL,
  "metric_results" TEXT NOT NULL,
  "overlaps" TEXT NOT NULL DEFAULT '[]',
  "exclusions" TEXT NOT NULL DEFAULT '[]',
  "raw_basis" TEXT NOT NULL,
  "validation_status" TEXT NOT NULL DEFAULT 'PASS',
  "status" TEXT NOT NULL DEFAULT 'PREVIEW',
  "reconciliation_hash" TEXT NOT NULL,
  "generated_by" TEXT NOT NULL,
  "previewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finalized_by" TEXT,
  "finalized_at" TIMESTAMP(3),
  CONSTRAINT "ResourceCountPreview_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ResourceCountPreview_tenant_id_environment_id_previewed_at_idx"
  ON "ResourceCountPreview"("tenant_id", "environment_id", "previewed_at");
CREATE INDEX "ResourceCountPreview_status_idx"
  ON "ResourceCountPreview"("status");

ALTER TABLE "ResourceObservation"
  ADD CONSTRAINT "ResourceObservation_resource_definition_id_fkey"
  FOREIGN KEY ("resource_definition_id") REFERENCES "ProtectedResourceDefinition"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ResourceCoveragePolicy"
  ADD CONSTRAINT "ResourceCoveragePolicy_resource_definition_id_fkey"
  FOREIGN KEY ("resource_definition_id") REFERENCES "ProtectedResourceDefinition"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResourceCoveragePolicy"
  ADD CONSTRAINT "ResourceCoveragePolicy_meter_definition_id_fkey"
  FOREIGN KEY ("meter_definition_id") REFERENCES "MeterDefinition"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResourceObservation"
  ADD CONSTRAINT "ResourceObservation_coverage_policy_id_fkey"
  FOREIGN KEY ("coverage_policy_id") REFERENCES "ResourceCoveragePolicy"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ResourceObservationWindow"
  ADD CONSTRAINT "ResourceObservationWindow_observation_id_fkey"
  FOREIGN KEY ("observation_id") REFERENCES "ResourceObservation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResourceCoverageDecision"
  ADD CONSTRAINT "ResourceCoverageDecision_observation_id_fkey"
  FOREIGN KEY ("observation_id") REFERENCES "ResourceObservation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResourceCoverageDecision"
  ADD CONSTRAINT "ResourceCoverageDecision_coverage_policy_id_fkey"
  FOREIGN KEY ("coverage_policy_id") REFERENCES "ResourceCoveragePolicy"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ResourceEnrollmentNotice"
  ADD CONSTRAINT "ResourceEnrollmentNotice_observation_id_fkey"
  FOREIGN KEY ("observation_id") REFERENCES "ResourceObservation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResourceEnrollmentNotice"
  ADD CONSTRAINT "ResourceEnrollmentNotice_coverage_policy_id_fkey"
  FOREIGN KEY ("coverage_policy_id") REFERENCES "ResourceCoveragePolicy"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing observations were classified without an authorized coverage
-- policy. Preserve their prior state in the append-only decision history and
-- fail closed to review/non-billable until explicitly accepted.
INSERT INTO "ResourceCoverageDecision" (
  "id", "tenant_id", "observation_id", "from_state", "to_state",
  "decision_type", "reason", "actor_id", "decided_at"
)
SELECT
  gen_random_uuid()::text,
  "tenant_id",
  "id",
  "coverage_state",
  'REVIEW_REQUIRED',
  'MIGRATION_REVIEW',
  'Legacy observation has no approved Category C coverage policy',
  'system:migration',
  CURRENT_TIMESTAMP
FROM "ResourceObservation";

UPDATE "ResourceObservation"
SET
  "coverage_state" = 'REVIEW_REQUIRED',
  "billable_state" = 'NON_BILLABLE',
  "decision_by" = 'system:migration',
  "decision_reason" = 'Legacy observation has no approved Category C coverage policy',
  "decided_at" = CURRENT_TIMESTAMP;
