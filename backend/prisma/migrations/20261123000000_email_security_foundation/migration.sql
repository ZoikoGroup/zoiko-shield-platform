-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "email_security";

-- CreateTable
CREATE TABLE "email_security"."EmailSourceConnection" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL DEFAULT 'default-env',
    "provider" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "connector_instance_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "capabilities" JSONB NOT NULL DEFAULT '{}',
    "consent_ref" TEXT,
    "granted_scope_hash" TEXT,
    "requested_scopes" TEXT[],
    "granted_scopes" TEXT[],
    "licence_assumptions" JSONB NOT NULL DEFAULT '{}',
    "residency_code" TEXT NOT NULL DEFAULT 'eu-west-1',
    "sync_frequency" TEXT NOT NULL DEFAULT 'POLL_5M',
    "retention_days" INTEGER NOT NULL DEFAULT 90,
    "legal_hold" BOOLEAN NOT NULL DEFAULT false,
    "last_sync_at" TIMESTAMP(3),
    "last_heartbeat_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoked_by" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmailSourceConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_security"."EmailConnectionIntent" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "requested_mode" TEXT NOT NULL DEFAULT 'READ_ONLY_TELEMETRY',
    "oauth_state" TEXT NOT NULL,
    "pkce_challenge_hash" TEXT,
    "requested_scopes" TEXT[],
    "residency_code" TEXT NOT NULL DEFAULT 'eu-west-1',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "granted_scope_hash" TEXT,
    "verification_report" JSONB,
    "connection_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmailConnectionIntent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_security"."SourceCoverageWindow" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "window_end" TIMESTAMP(3) NOT NULL,
    "eligible_event_types" TEXT[],
    "checkpoint_cursor" TEXT,
    "monotonic_sequence" BIGINT NOT NULL DEFAULT 0,
    "expected_count" INTEGER NOT NULL DEFAULT 0,
    "ingested_count" INTEGER NOT NULL DEFAULT 0,
    "duplicate_count" INTEGER NOT NULL DEFAULT 0,
    "rejected_count" INTEGER NOT NULL DEFAULT 0,
    "delayed_count" INTEGER NOT NULL DEFAULT 0,
    "missing_count" INTEGER NOT NULL DEFAULT 0,
    "gaps" JSONB NOT NULL DEFAULT '[]',
    "completeness_grade" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "source_health" TEXT NOT NULL DEFAULT 'UNAVAILABLE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SourceCoverageWindow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_security"."EmailThreatFinding" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "source_event_ref" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_verdict" TEXT NOT NULL,
    "threat_class" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OBSERVED',
    "policy_id" TEXT,
    "policy_version" TEXT NOT NULL DEFAULT 'v1',
    "observed_at" TIMESTAMP(3) NOT NULL,
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_reconciled_at" TIMESTAMP(3),
    "subject_ref" TEXT NOT NULL,
    "indicator_hashes" JSONB NOT NULL DEFAULT '[]',
    "attachment_hashes" JSONB NOT NULL DEFAULT '[]',
    "deep_link_url" TEXT,
    "source_confidence" TEXT NOT NULL DEFAULT 'MEDIUM',
    "coverage_state" TEXT NOT NULL DEFAULT 'COMPLETE',
    "case_id" TEXT,
    "assigned_analyst_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmailThreatFinding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_security"."EmailThreatAdjudication" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "finding_id" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "policy_version" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailThreatAdjudication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_security"."EmailDetectionDecision" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "finding_id" TEXT NOT NULL,
    "detector_tier" TEXT NOT NULL,
    "detector_version" TEXT NOT NULL,
    "model_version" TEXT,
    "source_facts" JSONB NOT NULL DEFAULT '[]',
    "inferences" JSONB NOT NULL DEFAULT '[]',
    "alternative_hypothesis" TEXT,
    "unknowns" JSONB NOT NULL DEFAULT '[]',
    "citation_refs" TEXT[],
    "abstained" BOOLEAN NOT NULL DEFAULT false,
    "confidence_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "native_baseline_verdict" TEXT,
    "adjudicated_label" TEXT,
    "false_positive_cost_usd" DOUBLE PRECISION,
    "reviewer_id" TEXT,
    "reviewer_outcome" TEXT,
    "reviewer_rationale" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmailDetectionDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_security"."EmailPolicyVersion" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "policy_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "provider_coverage" TEXT[],
    "input_sources" TEXT[],
    "severity_mapping" JSONB NOT NULL DEFAULT '{}',
    "excluded_scopes" JSONB NOT NULL DEFAULT '[]',
    "rationale" TEXT NOT NULL,
    "false_positive_impact" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "authored_by" TEXT NOT NULL,
    "approved_by" TEXT,
    "activated_by" TEXT,
    "effective_from" TIMESTAMP(3),
    "effective_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmailPolicyVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_security"."EmailEvidenceManifest" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "scope" JSONB NOT NULL DEFAULT '{}',
    "time_start" TIMESTAMP(3) NOT NULL,
    "time_end" TIMESTAMP(3) NOT NULL,
    "source_inventory" JSONB NOT NULL DEFAULT '[]',
    "exclusions" JSONB NOT NULL DEFAULT '[]',
    "coverage_gaps" JSONB NOT NULL DEFAULT '[]',
    "canonical_event_hashes" TEXT[],
    "merkle_root" TEXT,
    "merkle_proof_refs" JSONB NOT NULL DEFAULT '[]',
    "verifier_version" TEXT NOT NULL DEFAULT '1.0.0',
    "detached_checksum" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COLLECTING',
    "auditor_principal_id" TEXT,
    "auditor_grant_expires_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmailEvidenceManifest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_security"."EmailActionProposal" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "finding_id" TEXT,
    "provider" TEXT NOT NULL,
    "requested_action" TEXT NOT NULL,
    "target_refs" JSONB NOT NULL DEFAULT '[]',
    "consent_scope" TEXT NOT NULL,
    "risk_class" TEXT NOT NULL DEFAULT 'R3',
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "simulation_result" JSONB,
    "initiated_by" TEXT NOT NULL,
    "approved_by" TEXT,
    "approval_expires_at" TIMESTAMP(3),
    "execution_result" JSONB,
    "partial_outcomes" JSONB,
    "rollback_plan" JSONB NOT NULL DEFAULT '{}',
    "rollback_receipt" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmailActionProposal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_security"."EmailAccessAuditEvent" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "target_id" TEXT,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailAccessAuditEvent_pkey" PRIMARY KEY ("id")
);

-- Indexes & Foreign Keys
CREATE INDEX "EmailSourceConnection_tenant_id_provider_idx" ON "email_security"."EmailSourceConnection"("tenant_id", "provider");
CREATE INDEX "EmailSourceConnection_tenant_id_status_idx" ON "email_security"."EmailSourceConnection"("tenant_id", "status");
CREATE UNIQUE INDEX "EmailConnectionIntent_oauth_state_key" ON "email_security"."EmailConnectionIntent"("oauth_state");
CREATE INDEX "EmailConnectionIntent_tenant_id_status_idx" ON "email_security"."EmailConnectionIntent"("tenant_id", "status");
CREATE INDEX "SourceCoverageWindow_tenant_id_connection_id_idx" ON "email_security"."SourceCoverageWindow"("tenant_id", "connection_id");
CREATE INDEX "SourceCoverageWindow_tenant_id_window_start_window_end_idx" ON "email_security"."SourceCoverageWindow"("tenant_id", "window_start", "window_end");
CREATE UNIQUE INDEX "EmailThreatFinding_tenant_id_connection_id_source_event_ref_key" ON "email_security"."EmailThreatFinding"("tenant_id", "connection_id", "source_event_ref");
CREATE INDEX "EmailThreatFinding_tenant_id_severity_observed_at_idx" ON "email_security"."EmailThreatFinding"("tenant_id", "severity", "observed_at");
CREATE INDEX "EmailThreatFinding_tenant_id_status_idx" ON "email_security"."EmailThreatFinding"("tenant_id", "status");
CREATE INDEX "EmailThreatFinding_tenant_id_case_id_idx" ON "email_security"."EmailThreatFinding"("tenant_id", "case_id");
CREATE UNIQUE INDEX "EmailThreatAdjudication_tenant_id_finding_id_idempotency_ke_key" ON "email_security"."EmailThreatAdjudication"("tenant_id", "finding_id", "idempotency_key");
CREATE INDEX "EmailThreatAdjudication_tenant_id_finding_id_idx" ON "email_security"."EmailThreatAdjudication"("tenant_id", "finding_id");
CREATE INDEX "EmailDetectionDecision_tenant_id_finding_id_idx" ON "email_security"."EmailDetectionDecision"("tenant_id", "finding_id");
CREATE INDEX "EmailDetectionDecision_tenant_id_detector_tier_idx" ON "email_security"."EmailDetectionDecision"("tenant_id", "detector_tier");
CREATE UNIQUE INDEX "EmailPolicyVersion_tenant_id_policy_key_version_key" ON "email_security"."EmailPolicyVersion"("tenant_id", "policy_key", "version");
CREATE INDEX "EmailPolicyVersion_tenant_id_status_idx" ON "email_security"."EmailPolicyVersion"("tenant_id", "status");
CREATE INDEX "EmailEvidenceManifest_tenant_id_status_idx" ON "email_security"."EmailEvidenceManifest"("tenant_id", "status");
CREATE INDEX "EmailActionProposal_tenant_id_status_idx" ON "email_security"."EmailActionProposal"("tenant_id", "status");
CREATE INDEX "EmailAccessAuditEvent_tenant_id_created_at_idx" ON "email_security"."EmailAccessAuditEvent"("tenant_id", "created_at");

ALTER TABLE "email_security"."SourceCoverageWindow" ADD CONSTRAINT "SourceCoverageWindow_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "email_security"."EmailSourceConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "email_security"."EmailThreatFinding" ADD CONSTRAINT "EmailThreatFinding_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "email_security"."EmailSourceConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "email_security"."EmailThreatAdjudication" ADD CONSTRAINT "EmailThreatAdjudication_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "email_security"."EmailThreatFinding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "email_security"."EmailDetectionDecision" ADD CONSTRAINT "EmailDetectionDecision_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "email_security"."EmailThreatFinding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "email_security"."EmailActionProposal" ADD CONSTRAINT "EmailActionProposal_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "email_security"."EmailThreatFinding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed least-privilege Email Security permission codes
INSERT INTO "authorization".permissions (id, code, description)
VALUES
  (gen_random_uuid(), 'email:connector:view', 'View email security provider connections and capability metadata'),
  (gen_random_uuid(), 'email:connector:manage', 'Connect, verify, suspend, and revoke email security provider connections'),
  (gen_random_uuid(), 'email:threat:read', 'Read email threat queue, provenance metadata, and BEC/ATO intelligence'),
  (gen_random_uuid(), 'email:case:investigate', 'Promote email threats to cases and record non-destructive adjudications'),
  (gen_random_uuid(), 'email:coverage:read', 'Read email control coverage ratios, reconciliation gaps, and health'),
  (gen_random_uuid(), 'email:policy:read', 'Read immutable email detection policy versions and exceptions'),
  (gen_random_uuid(), 'email:policy:manage', 'Draft, approve, activate, and roll back email detection policy versions'),
  (gen_random_uuid(), 'email:evidence:export', 'Build, verify, and export email evidence manifests with gap disclosures'),
  (gen_random_uuid(), 'email:action:propose', 'Propose and simulate post-delivery email remediation actions'),
  (gen_random_uuid(), 'email:action:approve', 'Approve dual-custody email remediation actions'),
  (gen_random_uuid(), 'email:action:execute', 'Execute and roll back approved post-delivery email remediation actions')
ON CONFLICT (code) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code IN (
    'email:connector:view',
    'email:connector:manage',
    'email:threat:read',
    'email:case:investigate',
    'email:coverage:read',
    'email:policy:read',
    'email:policy:manage',
    'email:evidence:export'
  )
WHERE role.code = 'TENANT_OWNER'
  AND role."roleLevel" = 'TENANT'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code IN (
    'email:threat:read',
    'email:case:investigate',
    'email:coverage:read',
    'email:policy:read'
  )
WHERE role.code IN ('SECURITY_ANALYST', 'TENANT_SECURITY_ANALYST', 'SOC_ANALYST')
  AND role."roleLevel" = 'TENANT'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code IN (
    'email:coverage:read',
    'email:evidence:export',
    'email:policy:read'
  )
WHERE role.code IN ('AUDITOR', 'EXTERNAL_AUDITOR', 'SECURITY_AUDITOR')
  AND role."roleLevel" = 'TENANT'
ON CONFLICT (role_id, permission_id) DO NOTHING;
