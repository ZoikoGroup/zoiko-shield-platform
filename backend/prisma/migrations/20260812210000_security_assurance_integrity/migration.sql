ALTER TABLE "EvidenceLedgerEntry" ADD COLUMN "entry_metadata" TEXT NOT NULL DEFAULT '{}';

ALTER TABLE "WitnessReceipt"
  ADD COLUMN "algorithm" TEXT,
  ADD COLUMN "public_key" TEXT,
  ADD COLUMN "signature" TEXT;

CREATE TABLE "webhook_replay_nonces" (
  "id" TEXT NOT NULL,
  "connector_id" TEXT NOT NULL,
  "nonce_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_replay_nonces_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "connector_oauth_states" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "instance_id" TEXT NOT NULL,
  "state_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "connector_oauth_states_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "detection_rules" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "rule_type" TEXT NOT NULL DEFAULT 'MATCH',
  "severity" TEXT NOT NULL DEFAULT 'HIGH',
  "condition_definition" TEXT NOT NULL DEFAULT '{}',
  "required_fields" TEXT NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "current_version" INTEGER NOT NULL DEFAULT 1,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "detection_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "detection_runs" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "rule_id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "rule_version" INTEGER NOT NULL DEFAULT 1,
  "result" TEXT NOT NULL,
  "execution_details" TEXT DEFAULT '{}',
  "executed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "detection_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "control_test_runs" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "objective_id" TEXT NOT NULL,
  "result" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "details" TEXT DEFAULT '{}',
  "executed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "control_test_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assurance_reviews" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT 'Assurance Review',
  "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'NOT_EVALUATED',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assurance_reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vciso_reflections" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "assurance_review_id" TEXT,
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "notes" TEXT NOT NULL,
  "action_items" TEXT NOT NULL DEFAULT '[]',
  "author_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vciso_reflections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "claim_evaluations" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "claim_type" TEXT NOT NULL,
  "case_id" TEXT,
  "result" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "response_time_minutes" DOUBLE PRECISION,
  "justification" TEXT,
  "evidence_ids" TEXT NOT NULL DEFAULT '[]',
  "evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "claim_evaluations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "webhook_replay_nonces_expires_at_idx" ON "webhook_replay_nonces"("expires_at");
CREATE UNIQUE INDEX "webhook_replay_nonces_connector_id_nonce_hash_key" ON "webhook_replay_nonces"("connector_id", "nonce_hash");
CREATE UNIQUE INDEX "connector_oauth_states_state_hash_key" ON "connector_oauth_states"("state_hash");
CREATE INDEX "connector_oauth_states_tenant_id_idx" ON "connector_oauth_states"("tenant_id");
CREATE INDEX "connector_oauth_states_instance_id_idx" ON "connector_oauth_states"("instance_id");
CREATE INDEX "vciso_reflections_tenant_id_idx" ON "vciso_reflections"("tenant_id");
CREATE INDEX "vciso_reflections_assurance_review_id_idx" ON "vciso_reflections"("assurance_review_id");
CREATE INDEX "claim_evaluations_tenant_id_idx" ON "claim_evaluations"("tenant_id");
CREATE INDEX "claim_evaluations_case_id_idx" ON "claim_evaluations"("case_id");

ALTER TABLE "detection_runs" ADD CONSTRAINT "detection_runs_rule_id_fkey"
  FOREIGN KEY ("rule_id") REFERENCES "detection_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
