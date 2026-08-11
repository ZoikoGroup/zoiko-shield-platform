-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ConnectorState" AS ENUM ('NOT_CONNECTED', 'AWAITING_ADMIN_CONSENT', 'CONNECTED', 'SYNCING', 'HEALTHY', 'DEGRADED', 'RATE_LIMITED', 'PERMISSION_REVOKED', 'AUTHENTICATION_FAILED', 'CHECKPOINT_INVALID', 'DISCONNECTED');

-- CreateTable
CREATE TABLE "ConnectorDefinition" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "supportedEvents" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectorDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorInstance" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL DEFAULT 'default-env',
    "connectorDefId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" "ConnectorState" NOT NULL DEFAULT 'NOT_CONNECTED',
    "authentication_type" TEXT NOT NULL DEFAULT 'API_KEY',
    "source_region" TEXT,
    "externalTenantId" TEXT,
    "region" TEXT,
    "configurationVersion" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ConnectorInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorPermission" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "permissionType" TEXT NOT NULL DEFAULT 'READ',
    "granted" BOOLEAN NOT NULL DEFAULT false,
    "requiredForCapability" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectorPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorCredentialReference" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "credentialType" TEXT NOT NULL DEFAULT 'CLIENT_SECRET',
    "vaultReferenceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "rotatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectorCredentialReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorCheckpoint" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "checkpointValue" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectorCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorSynchronizationRun" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "syncType" TEXT,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "recordsReceived" INTEGER NOT NULL DEFAULT 0,
    "recordsProcessed" INTEGER NOT NULL DEFAULT 0,
    "recordsDuplicated" INTEGER NOT NULL DEFAULT 0,
    "recordsQuarantined" INTEGER NOT NULL DEFAULT 0,
    "checkpointBefore" TEXT,
    "checkpointAfter" TEXT,
    "errorCode" TEXT,

    CONSTRAINT "ConnectorSynchronizationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorHealthStatus" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "state" "ConnectorState" NOT NULL,
    "lastMessage" TEXT,
    "permissionStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "credentialStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "sourceLagSeconds" INTEGER,
    "lastSuccessfulConnectionAt" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectorHealthStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorError" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "errorCode" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectorError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookSubscription" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "clientState" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventHubConsumerCheckpoint" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "partitionId" TEXT NOT NULL,
    "offset" TEXT NOT NULL,
    "sequenceNumber" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventHubConsumerCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuarantinedEvent" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "rawPayload" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuarantinedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawEvent" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL DEFAULT 'default-env',
    "connector_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_event_id" TEXT,
    "source_region" TEXT,
    "occurred_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload_hash" TEXT NOT NULL,
    "raw_payload_reference" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL DEFAULT 'v1.0',
    "processing_status" TEXT NOT NULL DEFAULT 'ACCEPTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NormalizedEvent" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL DEFAULT 'default-env',
    "connector_id" TEXT NOT NULL,
    "raw_event_id" TEXT NOT NULL,
    "asset_id" TEXT,
    "identity_id" TEXT,
    "event_class" TEXT NOT NULL,
    "event_category" TEXT,
    "event_activity" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'INFORMATIONAL',
    "actor_user_id" TEXT,
    "actor_email" TEXT,
    "source_ip" TEXT,
    "destination_ip" TEXT,
    "resource_id" TEXT,
    "resource_type" TEXT,
    "action" TEXT,
    "outcome" TEXT,
    "occurred_at" TIMESTAMP(3),
    "observed_at" TIMESTAMP(3),
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mapping_version" TEXT NOT NULL DEFAULT '1.0',
    "normalization_status" TEXT NOT NULL DEFAULT 'NORMALIZED',

    CONSTRAINT "NormalizedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL DEFAULT 'default-env',
    "external_id" TEXT,
    "asset_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "criticality" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetAlias" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "source_system" TEXT NOT NULL,
    "source_account_id" TEXT,
    "external_type" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentityEntity" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "external_id" TEXT,
    "email" TEXT,
    "display_name" TEXT,
    "identity_type" TEXT NOT NULL DEFAULT 'USER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdentityEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentityAlias" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "identity_entity_id" TEXT NOT NULL,
    "source_system" TEXT NOT NULL,
    "source_account_id" TEXT,
    "external_type" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "normalized_value" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdentityAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Relationship" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL DEFAULT 'default-env',
    "subject_type" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "object_type" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Relationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResolutionDecision" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "source_system" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "resolved_entity_id" TEXT,
    "decision" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "resolver_version" TEXT NOT NULL DEFAULT '1.0',
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResolutionDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContextSnapshot" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL DEFAULT 'default-env',
    "event_id" TEXT NOT NULL,
    "identity_entity_id" TEXT,
    "asset_id" TEXT,
    "relationship_refs" TEXT NOT NULL DEFAULT '[]',
    "identity_risk" TEXT,
    "asset_criticality" TEXT,
    "source_versions" TEXT NOT NULL DEFAULT '{}',
    "resolver_version" TEXT NOT NULL DEFAULT '1.0',
    "context_health" TEXT NOT NULL DEFAULT 'UNRESOLVED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContextSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetectionDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "owner" TEXT,
    "category" TEXT NOT NULL DEFAULT 'IDENTITY',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DetectionDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetectionVersion" (
    "id" TEXT NOT NULL,
    "detection_definition_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "rule_type" TEXT NOT NULL DEFAULT 'POINT',
    "configuration" TEXT NOT NULL DEFAULT '{}',
    "required_event_types" TEXT NOT NULL DEFAULT '[]',
    "required_fields" TEXT NOT NULL DEFAULT '[]',
    "required_context" TEXT NOT NULL DEFAULT '[]',
    "allowed_missing_data_behavior" TEXT NOT NULL DEFAULT 'INDETERMINATE',
    "effective_from" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DetectionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetectionEvaluation" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL DEFAULT 'default-env',
    "detection_version_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "context_snapshot_id" TEXT,
    "evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" TEXT NOT NULL,
    "factor_snapshot" TEXT NOT NULL DEFAULT '[]',
    "confidence" DOUBLE PRECISION,
    "incomplete_data" BOOLEAN NOT NULL DEFAULT false,
    "reason_code" TEXT,
    "correlation_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event_payload_snapshot" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "DetectionEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetectionMatch" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL DEFAULT 'default-env',
    "detection_definition_id" TEXT NOT NULL,
    "detection_version_id" TEXT NOT NULL,
    "primary_event_id" TEXT NOT NULL,
    "supporting_event_refs" TEXT NOT NULL DEFAULT '[]',
    "context_snapshot_id" TEXT,
    "severity" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "factor_contributions" TEXT NOT NULL DEFAULT '[]',
    "incomplete_data" BOOLEAN NOT NULL DEFAULT false,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correlation_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DetectionMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetectionReplay" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "original_evaluation_id" TEXT NOT NULL,
    "detection_version_id" TEXT NOT NULL,
    "replayed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "original_result" TEXT NOT NULL,
    "replay_result" TEXT NOT NULL,
    "divergence" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DetectionReplay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL DEFAULT 'default-env',
    "region" TEXT NOT NULL DEFAULT 'unspecified',
    "detection_definition_id" TEXT NOT NULL,
    "detection_version_id" TEXT NOT NULL,
    "detection_match_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'HIGH',
    "priority" TEXT NOT NULL DEFAULT 'P2',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "source_event_ids" TEXT NOT NULL DEFAULT '[]',
    "affected_assets" TEXT NOT NULL DEFAULT '[]',
    "affected_identities" TEXT NOT NULL DEFAULT '[]',
    "primary_identity_id" TEXT,
    "primary_asset_id" TEXT,
    "context_snapshot_id" TEXT,
    "incomplete_data" BOOLEAN NOT NULL DEFAULT false,
    "coverage_state" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "assigned_to" TEXT,
    "assigned_queue" TEXT,
    "correlation_id" TEXT,
    "created_by" TEXT NOT NULL DEFAULT 'system',
    "acknowledged_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertAssignment" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "alert_id" TEXT NOT NULL,
    "queue_id" TEXT,
    "principal_id" TEXT,
    "assigned_by" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "AlertAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertSuppressionRule" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "detection_definition_id" TEXT,
    "identity_id" TEXT,
    "asset_id" TEXT,
    "condition" TEXT NOT NULL DEFAULT '{}',
    "reason" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "approved_by" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertSuppressionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboxEvent" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL DEFAULT 'default-env',
    "region" TEXT NOT NULL DEFAULT 'unspecified',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'HIGH',
    "priority" TEXT NOT NULL DEFAULT 'P2',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "owner_id" TEXT,
    "queue_id" TEXT,
    "primary_identity_id" TEXT,
    "primary_asset_id" TEXT,
    "sla_started_at" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "disposition" TEXT,
    "incident_id" TEXT,
    "correlation_id" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseAlert" (
    "tenant_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "alert_id" TEXT NOT NULL,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linked_by" TEXT NOT NULL,
    "relationship_type" TEXT NOT NULL DEFAULT 'PRIMARY',

    CONSTRAINT "CaseAlert_pkey" PRIMARY KEY ("case_id","alert_id")
);

-- CreateTable
CREATE TABLE "CaseTransition" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "from_state" TEXT NOT NULL,
    "to_state" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorization_decision_id" TEXT,
    "correlation_id" TEXT,

    CONSTRAINT "CaseTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseTimelineEntry" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "entry_type" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "source_ref" TEXT,
    "evidence_ref" TEXT,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseTimelineEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseNote" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "classification" TEXT NOT NULL DEFAULT 'INTERNAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersedes_id" TEXT,

    CONSTRAINT "CaseNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestigationHypothesis" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "created_by" TEXT NOT NULL,
    "supporting_evidence_refs" TEXT NOT NULL DEFAULT '[]',
    "contradicting_evidence_refs" TEXT NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "InvestigationHypothesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseDecision" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "decision_type" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "evidence_refs" TEXT NOT NULL DEFAULT '[]',
    "policy_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceRecord" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL DEFAULT 'default-env',
    "legal_entity_id" TEXT,
    "region" TEXT NOT NULL DEFAULT 'unspecified',
    "evidence_type" TEXT NOT NULL,
    "producing_service" TEXT NOT NULL,
    "source_system_id" TEXT NOT NULL,
    "source_object_id" TEXT NOT NULL,
    "collector_id" TEXT,
    "collector_version" TEXT,
    "source_observed_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "purpose" TEXT NOT NULL,
    "data_class" TEXT NOT NULL DEFAULT 'INTERNAL',
    "content_hash" TEXT NOT NULL,
    "hash_algorithm" TEXT NOT NULL DEFAULT 'SHA-256',
    "canonicalization_profile" TEXT NOT NULL DEFAULT 'zs-json-v1',
    "media_type" TEXT NOT NULL DEFAULT 'application/json',
    "size_bytes" INTEGER,
    "vault_reference" TEXT,
    "integrity_state" TEXT NOT NULL DEFAULT 'PENDING',
    "freshness_state" TEXT NOT NULL DEFAULT 'CURRENT',
    "completeness_state" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "retention_profile" TEXT NOT NULL DEFAULT 'STANDARD',
    "superseded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseEvidence" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "evidence_id" TEXT NOT NULL,
    "relationship" TEXT NOT NULL DEFAULT 'SOURCE',
    "added_by" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "CaseEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertEvidence" (
    "tenant_id" TEXT NOT NULL,
    "alert_id" TEXT NOT NULL,
    "evidence_id" TEXT NOT NULL,
    "relationship" TEXT NOT NULL DEFAULT 'SOURCE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertEvidence_pkey" PRIMARY KEY ("alert_id","evidence_id")
);

-- CreateTable
CREATE TABLE "EvidenceLineage" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "evidence_id" TEXT NOT NULL,
    "parent_evidence_id" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "transformation_type" TEXT,
    "transformation_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceLineage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceLedgerEntry" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "evidence_id" TEXT NOT NULL,
    "previous_entry_hash" TEXT,
    "entry_hash" TEXT NOT NULL,
    "canonicalization_profile" TEXT NOT NULL DEFAULT 'zs-ledger-v1',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceObservation" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL DEFAULT 'default-env',
    "canonical_resource_id" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "source_connector_id" TEXT NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "coverage_state" TEXT NOT NULL DEFAULT 'DISCOVERED',
    "billable_state" TEXT NOT NULL DEFAULT 'NON_BILLABLE',
    "exclusion_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL DEFAULT 'default-env',
    "meter_version" TEXT NOT NULL DEFAULT 'v1.0',
    "source_type" TEXT NOT NULL,
    "raw_event_id" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'EVENTS',
    "accepted_quantity" INTEGER NOT NULL DEFAULT 1,
    "billable_quantity" INTEGER NOT NULL DEFAULT 0,
    "usage_state" TEXT NOT NULL DEFAULT 'ACCEPTED',
    "billing_classification" TEXT NOT NULL DEFAULT 'COMMERCIAL_DIRECT',
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "billing_source" TEXT NOT NULL DEFAULT 'DIRECT',
    "billing_classification" TEXT NOT NULL DEFAULT 'COMMERCIAL_DIRECT',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entitlement" (
    "id" TEXT NOT NULL,
    "commercial_account_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "offer_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimRegister" (
    "id" TEXT NOT NULL,
    "claim_key" TEXT NOT NULL,
    "approved_wording" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "requires_evidence" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimRegister_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogVersion" (
    "id" TEXT NOT NULL,
    "version_label" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMP(3),
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "catalog_version_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "offer_family" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "metric_family" TEXT NOT NULL,
    "requires" TEXT NOT NULL DEFAULT '[]',
    "incompatible_with" TEXT NOT NULL DEFAULT '[]',
    "region_scope" TEXT NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceBook" (
    "id" TEXT NOT NULL,
    "catalog_version_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'GLOBAL',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "channel" TEXT NOT NULL DEFAULT 'DIRECT',
    "unit_price" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "minimum_commit" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "overage_rate" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMP(3),
    "margin_gate_passed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "commercial_account_id" TEXT NOT NULL,
    "catalog_version_id" TEXT NOT NULL,
    "term_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "term_end" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "snapshot_hash" TEXT NOT NULL DEFAULT 'sha256-snapshot',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProtectedResourceDefinition" (
    "id" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "identity_key_spec" TEXT NOT NULL DEFAULT '{}',
    "ephemeral_policy" TEXT NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProtectedResourceDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceObligation" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "obligation_type" TEXT NOT NULL,
    "coverage_window" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_DUE',
    "due_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "evidence_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialInvoice" (
    "id" TEXT NOT NULL,
    "commercial_account_id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "total_amount" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "issued_at" TIMESTAMP(3),
    "immutable_snapshot" TEXT NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialEvent" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "tenant_id" TEXT,
    "actor" TEXT,
    "payload" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "CommercialEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorizationDecision" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "decision" TEXT NOT NULL,
    "policy_version" TEXT NOT NULL DEFAULT '1.0',
    "reason" TEXT NOT NULL,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthorizationDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUseCase" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "risk_class" TEXT NOT NULL DEFAULT 'STANDARD',
    "allowed_data_classes" TEXT NOT NULL DEFAULT '[]',
    "allowed_tools" TEXT NOT NULL DEFAULT '[]',
    "human_review_required" BOOLEAN NOT NULL DEFAULT true,
    "prohibited_actions" TEXT NOT NULL DEFAULT '[]',
    "max_input_tokens" INTEGER,
    "max_output_tokens" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiUseCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelProfile" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "model_version" TEXT,
    "region" TEXT NOT NULL,
    "approved_data_classes" TEXT NOT NULL DEFAULT '[]',
    "retention_policy" TEXT NOT NULL DEFAULT 'NONE',
    "training_allowed" BOOLEAN NOT NULL DEFAULT false,
    "fallback_profile_id" TEXT,
    "evaluation_version" TEXT NOT NULL DEFAULT '1.0',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptProfile" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "system_prompt_ref" TEXT NOT NULL,
    "output_schema" TEXT NOT NULL DEFAULT '{}',
    "allowed_sources" TEXT NOT NULL DEFAULT '[]',
    "safety_policy_version" TEXT NOT NULL DEFAULT '1.0',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiOutput" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL DEFAULT 'default-env',
    "use_case_id" TEXT NOT NULL,
    "model_profile_id" TEXT NOT NULL,
    "prompt_profile_id" TEXT NOT NULL,
    "retrieval_bundle_id" TEXT,
    "output_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "citations" TEXT NOT NULL DEFAULT '[]',
    "limitations" TEXT NOT NULL DEFAULT '[]',
    "safety_result" TEXT NOT NULL DEFAULT 'PENDING',
    "review_status" TEXT NOT NULL DEFAULT 'UNREVIEWED',
    "authorization_decision_id" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiOutput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiHumanReview" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "ai_output_id" TEXT NOT NULL,
    "reviewer_id" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "rationale" TEXT,
    "modified_content" TEXT,
    "reviewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiHumanReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetrievalBundle" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL DEFAULT 'default-env',
    "purpose" TEXT NOT NULL,
    "case_id" TEXT,
    "source_refs" TEXT NOT NULL DEFAULT '[]',
    "evidence_refs" TEXT NOT NULL DEFAULT '[]',
    "source_versions" TEXT NOT NULL DEFAULT '{}',
    "freshness_state" TEXT NOT NULL DEFAULT 'CURRENT',
    "completeness_state" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "acl_snapshot" TEXT NOT NULL DEFAULT '{}',
    "index_version" TEXT,
    "poisoning_check_result" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetrievalBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiToolCall" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "agent_run_id" TEXT,
    "tool_name" TEXT NOT NULL,
    "tool_version" TEXT NOT NULL DEFAULT '1.0',
    "arguments_hash" TEXT NOT NULL,
    "authorization_decision_id" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "result_ref" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error_code" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "AiToolCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionProposal" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL,
    "case_id" TEXT,
    "alert_id" TEXT,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "authority_level" TEXT NOT NULL DEFAULT 'R1',
    "requested_by" TEXT NOT NULL,
    "recommendation_source" TEXT NOT NULL,
    "policy_version" TEXT NOT NULL DEFAULT '1.0',
    "reversible" BOOLEAN NOT NULL DEFAULT true,
    "rollback_action_type" TEXT,
    "residual_risk" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "authorization_decision_id" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionApproval" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "approver_id" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "authority" TEXT NOT NULL DEFAULT 'R1',
    "scope" TEXT NOT NULL DEFAULT '{}',
    "reason" TEXT,
    "proposal_version" INTEGER NOT NULL,
    "action_type" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "approved_material_hash" TEXT NOT NULL,
    "authorization_decision_id" TEXT NOT NULL,
    "approved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionCommand" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "target" TEXT NOT NULL DEFAULT '{}',
    "authority_level" TEXT NOT NULL DEFAULT 'R1',
    "approval_refs" TEXT NOT NULL DEFAULT '[]',
    "policy_version" TEXT NOT NULL DEFAULT '1.0',
    "nonce" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "rate_class" TEXT NOT NULL DEFAULT 'DEFAULT',
    "expected_receipt_schema" TEXT,
    "signature" TEXT,
    "correlation_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionReceipt" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "action_command_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'SIMULATION',
    "provider_receipt_id" TEXT,
    "status" TEXT NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "executed_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "observed_state" TEXT NOT NULL DEFAULT '{}',
    "error_code" TEXT,
    "signature_verified" BOOLEAN,
    "correlation_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionReconciliation" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "action_command_id" TEXT NOT NULL,
    "action_receipt_id" TEXT,
    "expected_state" TEXT NOT NULL DEFAULT '{}',
    "observed_state" TEXT NOT NULL DEFAULT '{}',
    "result" TEXT NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evidence_ref" TEXT,

    CONSTRAINT "ActionReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionRateLimit" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "target_class" TEXT NOT NULL DEFAULT 'DEFAULT',
    "window" TEXT NOT NULL DEFAULT '1h',
    "maximum" INTEGER NOT NULL DEFAULT 10,

    CONSTRAINT "ActionRateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Freeze" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "scope" TEXT NOT NULL,
    "scope_ref" TEXT,
    "reason" TEXT NOT NULL,
    "active_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active_until" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Freeze_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybookDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaybookDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybookVersion" (
    "id" TEXT NOT NULL,
    "playbook_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'SIMULATION',
    "inputs" TEXT NOT NULL DEFAULT '{}',
    "steps" TEXT NOT NULL DEFAULT '[]',
    "required_authority" TEXT NOT NULL DEFAULT 'R1',
    "compensation" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),

    CONSTRAINT "PlaybookVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybookRun" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "playbook_version_id" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'SIMULATION',
    "triggered_by" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "termination_reason" TEXT,

    CONSTRAINT "PlaybookRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Framework" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "edition" TEXT,
    "publisher" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "effective_from" TIMESTAMP(3),
    "retired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Framework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FrameworkVersion" (
    "id" TEXT NOT NULL,
    "framework_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FrameworkVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requirement" (
    "id" TEXT NOT NULL,
    "framework_version_id" TEXT NOT NULL,
    "external_reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "applicability_rule" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Obligation" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "source" TEXT NOT NULL,
    "external_reference" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Obligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlObjective" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ControlObjective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlMapping" (
    "id" TEXT NOT NULL,
    "control_objective_id" TEXT NOT NULL,
    "framework_version_id" TEXT NOT NULL,
    "requirement_id" TEXT NOT NULL,
    "mapping_type" TEXT NOT NULL,
    "mapping_version" TEXT NOT NULL,
    "rationale" TEXT,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3),
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersedes_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlImplementation" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "environment_id" TEXT,
    "control_objective_id" TEXT NOT NULL,
    "implementation_version" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "implementation_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "not_applicable_rationale" TEXT,
    "authorization_decision_id" TEXT,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ControlImplementation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlScope" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "control_implementation_id" TEXT NOT NULL,
    "legal_entity_id" TEXT,
    "environment_id" TEXT,
    "business_unit_id" TEXT,
    "asset_scope" TEXT,
    "identity_scope" TEXT,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "ControlScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlTest" (
    "id" TEXT NOT NULL,
    "control_objective_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "test_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "owner" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlTestVersion" (
    "id" TEXT NOT NULL,
    "control_test_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "input_schema" TEXT NOT NULL DEFAULT '{}',
    "evaluator_version_id" TEXT,
    "evaluation_policy" TEXT NOT NULL DEFAULT '{}',
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',

    CONSTRAINT "ControlTestVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpectedEvidenceRule" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "control_test_version_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "evidence_type" TEXT NOT NULL,
    "expected_source" TEXT NOT NULL,
    "expected_population" TEXT NOT NULL,
    "expected_period" TEXT NOT NULL,
    "freshness_threshold" TEXT NOT NULL,
    "minimum_coverage" DOUBLE PRECISION,
    "required_permissions" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpectedEvidenceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpectedEvidenceResult" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "assessment_period_start" TIMESTAMP(3) NOT NULL,
    "assessment_period_end" TIMESTAMP(3) NOT NULL,
    "expected_count" INTEGER,
    "observed_count" INTEGER,
    "coverage_state" TEXT NOT NULL,
    "freshness_state" TEXT NOT NULL,
    "integrity_state" TEXT NOT NULL,
    "gap_count" INTEGER NOT NULL DEFAULT 0,
    "evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpectedEvidenceResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceGap" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "expected_evidence_rule_id" TEXT NOT NULL,
    "control_test_version_id" TEXT,
    "reason" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT '{}',
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "severity" TEXT,
    "source_health_state" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "EvidenceGap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evaluator" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "control_scope" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evaluator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluatorVersion" (
    "id" TEXT NOT NULL,
    "evaluator_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "accepted_evidence_schemas" TEXT NOT NULL DEFAULT '[]',
    "required_fields" TEXT NOT NULL DEFAULT '[]',
    "runtime_profile" TEXT NOT NULL DEFAULT 'node',
    "configuration" TEXT NOT NULL DEFAULT '{}',
    "content_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),

    CONSTRAINT "EvaluatorVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceBundle" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "control_test_version_id" TEXT NOT NULL,
    "expected_evidence_result_id" TEXT,
    "evidence_refs" TEXT NOT NULL DEFAULT '[]',
    "evidence_hashes" TEXT NOT NULL DEFAULT '[]',
    "mapping_versions" TEXT NOT NULL DEFAULT '[]',
    "context_versions" TEXT NOT NULL DEFAULT '[]',
    "bundle_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationRun" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "control_test_version_id" TEXT NOT NULL,
    "evaluator_version_id" TEXT NOT NULL,
    "evidence_bundle_id" TEXT NOT NULL,
    "input_bundle_hash" TEXT NOT NULL,
    "output_hash" TEXT,
    "context_snapshot_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "result" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "limitations" TEXT NOT NULL DEFAULT '[]',
    "confidence" DOUBLE PRECISION,
    "replayable" BOOLEAN NOT NULL DEFAULT true,
    "replay_of_id" TEXT,
    "deterministic_profile" TEXT NOT NULL DEFAULT 'zs-eval-v1',
    "correlation_id" TEXT NOT NULL,

    CONSTRAINT "EvaluationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualTestRun" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "control_test_version_id" TEXT NOT NULL,
    "performer_id" TEXT NOT NULL,
    "reviewer_id" TEXT,
    "procedure_version" TEXT NOT NULL,
    "sampled_population" TEXT,
    "evidence_refs" TEXT NOT NULL DEFAULT '[]',
    "result" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "limitations" TEXT NOT NULL DEFAULT '[]',
    "performed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "ManualTestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "control_implementation_id" TEXT NOT NULL,
    "control_test_version_id" TEXT NOT NULL,
    "assessment_period_start" TIMESTAMP(3) NOT NULL,
    "assessment_period_end" TIMESTAMP(3) NOT NULL,
    "evidence_bundle_id" TEXT,
    "evaluation_run_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "effectiveness" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "completeness_state" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "freshness_state" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "integrity_state" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "performer_id" TEXT,
    "reviewer_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "limitations" TEXT NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlDeficiency" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "assessment_id" TEXT NOT NULL,
    "control_objective_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence_refs" TEXT NOT NULL DEFAULT '[]',
    "owner_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "ControlDeficiency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Risk" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "likelihood" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "inherent_risk" TEXT,
    "residual_risk" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "owner_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Risk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskFactor" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "risk_id" TEXT NOT NULL,
    "factor" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "contribution" DOUBLE PRECISION NOT NULL,
    "source_ref" TEXT NOT NULL,
    "evaluator_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskFactor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskTreatment" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "risk_id" TEXT NOT NULL,
    "treatment_type" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "due_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskTreatment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskAcceptance" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "risk_id" TEXT NOT NULL,
    "accepted_by" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "compensating_controls" TEXT NOT NULL DEFAULT '[]',
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3),
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersedes_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "review_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "RiskAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exception" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "control_objective_id" TEXT,
    "control_implementation_id" TEXT,
    "requirement_id" TEXT,
    "risk_id" TEXT,
    "reason" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT '{}',
    "compensating_controls" TEXT NOT NULL DEFAULT '[]',
    "requested_by" TEXT NOT NULL,
    "approved_by" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Exception_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditPackage" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "purpose" TEXT NOT NULL,
    "framework_scope" TEXT NOT NULL DEFAULT '[]',
    "legal_entity_scope" TEXT,
    "environment_scope" TEXT,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "frozen_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "supersedes_package_id" TEXT,

    CONSTRAINT "AuditPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditPackageApproval" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "package_version" INTEGER NOT NULL,
    "approver_id" TEXT NOT NULL,
    "manifest_core_hash" TEXT NOT NULL,
    "authorization_decision_id" TEXT NOT NULL,
    "approved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditPackageApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditPackageManifest" (
    "id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "package_version" INTEGER NOT NULL,
    "manifest_core_content" TEXT NOT NULL,
    "manifest_core_hash" TEXT,
    "proof_envelope_content" TEXT,
    "manifest_content" TEXT,
    "package_envelope_hash" TEXT,
    "canonicalization_profile" TEXT NOT NULL DEFAULT 'zs-manifest-v1',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditPackageManifest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantAnchorHead" (
    "tenant_id" TEXT NOT NULL,
    "last_anchor_sequence" INTEGER NOT NULL DEFAULT 0,
    "last_checkpoint_id" TEXT,
    "last_checkpoint_hash" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TenantAnchorHead_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "Checkpoint" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "anchor_sequence" INTEGER NOT NULL,
    "ledger_sequence" INTEGER NOT NULL,
    "ledger_head_hash" TEXT NOT NULL,
    "package_id" TEXT,
    "package_version" INTEGER,
    "manifest_core_hash" TEXT,
    "leaf_hashes" TEXT NOT NULL,
    "merkle_root" TEXT NOT NULL,
    "tree_profile" TEXT NOT NULL DEFAULT 'ZS-MERKLE-V1',
    "hash_algorithm" TEXT NOT NULL DEFAULT 'SHA-256',
    "canonicalization_profile" TEXT NOT NULL DEFAULT 'zs-checkpoint-v1',
    "signing_key_id" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "witness_assurance_state" TEXT NOT NULL DEFAULT 'TEST_ONLY',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "Checkpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SigningKey" (
    "id" TEXT NOT NULL,
    "key_id" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'Ed25519',
    "public_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SigningKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WitnessReceipt" (
    "id" TEXT NOT NULL,
    "checkpoint_id" TEXT NOT NULL,
    "witness_id" TEXT NOT NULL,
    "witness_type" TEXT NOT NULL DEFAULT 'MOCK',
    "receipt_hash" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',

    CONSTRAINT "WitnessReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "report_type" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "purpose" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "source_requirements" TEXT NOT NULL DEFAULT '[]',
    "metric_definitions" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportingProjection" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "environment_id" TEXT,
    "projection_type" TEXT NOT NULL,
    "source_domain" TEXT NOT NULL,
    "source_object_id" TEXT NOT NULL,
    "source_version" TEXT,
    "source_occurred_at" TIMESTAMP(3),
    "source_recorded_at" TIMESTAMP(3),
    "freshness_state" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "completeness_state" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "health_state" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "projection_version" INTEGER NOT NULL DEFAULT 1,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "last_reconciled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportingProjection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSnapshot" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "environment_id" TEXT,
    "report_definition_id" TEXT NOT NULL,
    "report_definition_version" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "generated_by" TEXT NOT NULL,
    "source_snapshot_refs" TEXT NOT NULL DEFAULT '[]',
    "source_versions" TEXT NOT NULL DEFAULT '[]',
    "freshness_state" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "completeness_state" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "limitations" TEXT NOT NULL DEFAULT '[]',
    "payload" TEXT NOT NULL DEFAULT '{}',
    "snapshot_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BUILDING',
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutiveReportSnapshot" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "report_snapshot_id" TEXT NOT NULL,
    "reporting_period" TEXT NOT NULL,
    "metrics" TEXT NOT NULL DEFAULT '[]',
    "known_limitations" TEXT NOT NULL DEFAULT '[]',
    "source_refs" TEXT NOT NULL DEFAULT '[]',
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutiveReportSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPolicy" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "audience_type" TEXT NOT NULL,
    "severity" TEXT,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "allowed_channels" TEXT NOT NULL DEFAULT '[]',
    "acknowledgement_required" BOOLEAN NOT NULL DEFAULT false,
    "escalation_policy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en-US',
    "version" INTEGER NOT NULL,
    "subject_template" TEXT,
    "body_template" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "principal_id" TEXT NOT NULL,
    "notification_policy_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "quiet_hours" TEXT,
    "locale" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationChannelConfig" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "channel_type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "configuration_ref" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationChannelConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "policy_version" INTEGER NOT NULL,
    "recipient_principal_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "template_version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "first_attempt_at" TIMESTAMP(3),
    "last_attempt_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "error_code" TEXT,
    "correlation_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationAcknowledgement" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "notification_delivery_id" TEXT NOT NULL,
    "principal_id" TEXT NOT NULL,
    "acknowledgement_type" TEXT NOT NULL,
    "acknowledged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correlation_id" TEXT NOT NULL,

    CONSTRAINT "NotificationAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiClient" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "principal_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "environment_scope" TEXT,
    "purpose" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiClientCredential" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "api_client_id" TEXT NOT NULL,
    "secret_version" INTEGER NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "rotated_from_id" TEXT,

    CONSTRAINT "ApiClientCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiScopeGrant" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "api_client_id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "environment_id" TEXT,
    "granted_by" TEXT NOT NULL,
    "authorization_decision_id" TEXT NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiScopeGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundWebhookSubscription" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "api_client_id" TEXT,
    "endpoint_url" TEXT NOT NULL,
    "event_types" TEXT NOT NULL DEFAULT '[]',
    "payload_version" TEXT NOT NULL DEFAULT '1.0',
    "data_minimization_profile" TEXT NOT NULL DEFAULT 'default',
    "status" TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "created_by" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3),
    "suspended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundWebhookSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookSecretVersion" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "webhook_subscription_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "secret_ref" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "WebhookSecretVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "webhook_subscription_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload_version" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "first_attempt_at" TIMESTAMP(3),
    "last_attempt_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "response_status" INTEGER,
    "replay_of_delivery_id" TEXT,
    "correlation_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDeliveryAttempt" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "response_status" INTEGER,
    "error_class" TEXT,
    "retryable" BOOLEAN NOT NULL DEFAULT true,
    "duration_ms" INTEGER,

    CONSTRAINT "WebhookDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "environment_id" TEXT,
    "requested_by" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "export_type" TEXT NOT NULL,
    "requested_scope" TEXT NOT NULL DEFAULT '[]',
    "formats" TEXT NOT NULL DEFAULT '["JSON"]',
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "authorization_decision_id" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "failure_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportArtifact" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "export_job_id" TEXT NOT NULL,
    "artifact_type" TEXT NOT NULL,
    "schema_id" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL,
    "object_count" INTEGER NOT NULL DEFAULT 0,
    "content_hash" TEXT NOT NULL,
    "media_type" TEXT NOT NULL DEFAULT 'application/json',
    "object_storage_ref" TEXT,
    "size_bytes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportManifest" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "export_job_id" TEXT NOT NULL,
    "manifest_version" TEXT NOT NULL DEFAULT '1.0',
    "scope" TEXT NOT NULL DEFAULT '[]',
    "purpose" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "schema_versions" TEXT NOT NULL DEFAULT '[]',
    "artifacts" TEXT NOT NULL DEFAULT '[]',
    "counts" TEXT NOT NULL DEFAULT '{}',
    "hashes" TEXT NOT NULL DEFAULT '{}',
    "evidence_proof_refs" TEXT NOT NULL DEFAULT '[]',
    "audit_package_refs" TEXT NOT NULL DEFAULT '[]',
    "known_limitations" TEXT NOT NULL DEFAULT '[]',
    "legal_hold_state" TEXT NOT NULL DEFAULT 'NONE',
    "completeness_state" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "manifest_hash" TEXT NOT NULL,

    CONSTRAINT "ExportManifest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalHold" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT '{}',
    "authority" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMP(3),
    "review_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT NOT NULL,
    "authorization_decision_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeletionRequest" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "requested_by" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "legal_hold_state" TEXT NOT NULL DEFAULT 'NONE',
    "authorization_decision_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "DeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeletionTask" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "deletion_request_id" TEXT NOT NULL,
    "store_type" TEXT NOT NULL,
    "object_type" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "verification_result" TEXT,
    "error_code" TEXT,

    CONSTRAINT "DeletionTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupExpiryRecord" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "deletion_request_id" TEXT NOT NULL,
    "backup_class" TEXT NOT NULL,
    "retained_until" TIMESTAMP(3) NOT NULL,
    "final_expiry_expected_at" TIMESTAMP(3) NOT NULL,
    "verified_expired_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackupExpiryRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeletionAttestation" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "deletion_request_id" TEXT NOT NULL,
    "deleted_scopes" TEXT NOT NULL DEFAULT '[]',
    "retained_scopes" TEXT NOT NULL DEFAULT '[]',
    "legal_hold_refs" TEXT NOT NULL DEFAULT '[]',
    "backup_expiry_refs" TEXT NOT NULL DEFAULT '[]',
    "derived_store_results" TEXT NOT NULL DEFAULT '[]',
    "evidence_refs" TEXT NOT NULL DEFAULT '[]',
    "limitations" TEXT NOT NULL DEFAULT '[]',
    "attestation_hash" TEXT NOT NULL,
    "issued_by" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeletionAttestation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantOffboardingRun" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "requested_by" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "export_job_id" TEXT,
    "deletion_request_id" TEXT,
    "initiated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "authorization_decision_id" TEXT NOT NULL,

    CONSTRAINT "TenantOffboardingRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorDefinition_provider_key" ON "ConnectorDefinition"("provider");

-- CreateIndex
CREATE INDEX "ConnectorInstance_tenant_id_idx" ON "ConnectorInstance"("tenant_id");

-- CreateIndex
CREATE INDEX "ConnectorPermission_tenant_id_idx" ON "ConnectorPermission"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorPermission_instanceId_permission_key" ON "ConnectorPermission"("instanceId", "permission");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorCredentialReference_vaultReferenceId_key" ON "ConnectorCredentialReference"("vaultReferenceId");

-- CreateIndex
CREATE INDEX "ConnectorCredentialReference_tenant_id_idx" ON "ConnectorCredentialReference"("tenant_id");

-- CreateIndex
CREATE INDEX "ConnectorCheckpoint_tenant_id_idx" ON "ConnectorCheckpoint"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorCheckpoint_instanceId_resourceType_key" ON "ConnectorCheckpoint"("instanceId", "resourceType");

-- CreateIndex
CREATE INDEX "ConnectorSynchronizationRun_tenant_id_idx" ON "ConnectorSynchronizationRun"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorHealthStatus_instanceId_key" ON "ConnectorHealthStatus"("instanceId");

-- CreateIndex
CREATE INDEX "ConnectorHealthStatus_tenant_id_idx" ON "ConnectorHealthStatus"("tenant_id");

-- CreateIndex
CREATE INDEX "ConnectorError_tenant_id_idx" ON "ConnectorError"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookSubscription_clientState_key" ON "WebhookSubscription"("clientState");

-- CreateIndex
CREATE INDEX "WebhookSubscription_tenant_id_idx" ON "WebhookSubscription"("tenant_id");

-- CreateIndex
CREATE INDEX "EventHubConsumerCheckpoint_tenant_id_idx" ON "EventHubConsumerCheckpoint"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "EventHubConsumerCheckpoint_instanceId_partitionId_key" ON "EventHubConsumerCheckpoint"("instanceId", "partitionId");

-- CreateIndex
CREATE INDEX "QuarantinedEvent_tenant_id_idx" ON "QuarantinedEvent"("tenant_id");

-- CreateIndex
CREATE INDEX "RawEvent_tenant_id_idx" ON "RawEvent"("tenant_id");

-- CreateIndex
CREATE INDEX "RawEvent_connector_id_idx" ON "RawEvent"("connector_id");

-- CreateIndex
CREATE INDEX "RawEvent_payload_hash_idx" ON "RawEvent"("payload_hash");

-- CreateIndex
CREATE UNIQUE INDEX "RawEvent_tenant_id_connector_id_source_event_id_key" ON "RawEvent"("tenant_id", "connector_id", "source_event_id");

-- CreateIndex
CREATE INDEX "NormalizedEvent_tenant_id_idx" ON "NormalizedEvent"("tenant_id");

-- CreateIndex
CREATE INDEX "NormalizedEvent_connector_id_idx" ON "NormalizedEvent"("connector_id");

-- CreateIndex
CREATE INDEX "NormalizedEvent_raw_event_id_idx" ON "NormalizedEvent"("raw_event_id");

-- CreateIndex
CREATE INDEX "NormalizedEvent_asset_id_idx" ON "NormalizedEvent"("asset_id");

-- CreateIndex
CREATE INDEX "NormalizedEvent_identity_id_idx" ON "NormalizedEvent"("identity_id");

-- CreateIndex
CREATE INDEX "Asset_tenant_id_idx" ON "Asset"("tenant_id");

-- CreateIndex
CREATE INDEX "Asset_criticality_idx" ON "Asset"("criticality");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_tenant_id_external_id_asset_type_key" ON "Asset"("tenant_id", "external_id", "asset_type");

-- CreateIndex
CREATE INDEX "AssetAlias_tenant_id_idx" ON "AssetAlias"("tenant_id");

-- CreateIndex
CREATE INDEX "AssetAlias_asset_id_idx" ON "AssetAlias"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "AssetAlias_tenant_id_source_system_source_account_id_extern_key" ON "AssetAlias"("tenant_id", "source_system", "source_account_id", "external_type", "external_id");

-- CreateIndex
CREATE INDEX "IdentityEntity_tenant_id_idx" ON "IdentityEntity"("tenant_id");

-- CreateIndex
CREATE INDEX "IdentityEntity_email_idx" ON "IdentityEntity"("email");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityEntity_tenant_id_email_key" ON "IdentityEntity"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "IdentityAlias_tenant_id_idx" ON "IdentityAlias"("tenant_id");

-- CreateIndex
CREATE INDEX "IdentityAlias_identity_entity_id_idx" ON "IdentityAlias"("identity_entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityAlias_tenant_id_source_system_source_account_id_ext_key" ON "IdentityAlias"("tenant_id", "source_system", "source_account_id", "external_type", "external_id");

-- CreateIndex
CREATE INDEX "Relationship_tenant_id_idx" ON "Relationship"("tenant_id");

-- CreateIndex
CREATE INDEX "Relationship_subject_type_subject_id_idx" ON "Relationship"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "Relationship_object_type_object_id_idx" ON "Relationship"("object_type", "object_id");

-- CreateIndex
CREATE UNIQUE INDEX "Relationship_tenant_id_subject_type_subject_id_relation_obj_key" ON "Relationship"("tenant_id", "subject_type", "subject_id", "relation", "object_type", "object_id");

-- CreateIndex
CREATE INDEX "ResolutionDecision_tenant_id_idx" ON "ResolutionDecision"("tenant_id");

-- CreateIndex
CREATE INDEX "ResolutionDecision_entity_type_idx" ON "ResolutionDecision"("entity_type");

-- CreateIndex
CREATE INDEX "ContextSnapshot_tenant_id_idx" ON "ContextSnapshot"("tenant_id");

-- CreateIndex
CREATE INDEX "ContextSnapshot_event_id_idx" ON "ContextSnapshot"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "DetectionDefinition_key_key" ON "DetectionDefinition"("key");

-- CreateIndex
CREATE INDEX "DetectionDefinition_status_idx" ON "DetectionDefinition"("status");

-- CreateIndex
CREATE INDEX "DetectionVersion_status_idx" ON "DetectionVersion"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DetectionVersion_detection_definition_id_version_key" ON "DetectionVersion"("detection_definition_id", "version");

-- CreateIndex
CREATE INDEX "DetectionEvaluation_tenant_id_idx" ON "DetectionEvaluation"("tenant_id");

-- CreateIndex
CREATE INDEX "DetectionEvaluation_detection_version_id_idx" ON "DetectionEvaluation"("detection_version_id");

-- CreateIndex
CREATE INDEX "DetectionEvaluation_event_id_idx" ON "DetectionEvaluation"("event_id");

-- CreateIndex
CREATE INDEX "DetectionEvaluation_result_idx" ON "DetectionEvaluation"("result");

-- CreateIndex
CREATE INDEX "DetectionMatch_tenant_id_idx" ON "DetectionMatch"("tenant_id");

-- CreateIndex
CREATE INDEX "DetectionMatch_detection_definition_id_idx" ON "DetectionMatch"("detection_definition_id");

-- CreateIndex
CREATE UNIQUE INDEX "DetectionMatch_tenant_id_detection_version_id_primary_event_key" ON "DetectionMatch"("tenant_id", "detection_version_id", "primary_event_id", "context_snapshot_id");

-- CreateIndex
CREATE INDEX "DetectionReplay_tenant_id_idx" ON "DetectionReplay"("tenant_id");

-- CreateIndex
CREATE INDEX "DetectionReplay_original_evaluation_id_idx" ON "DetectionReplay"("original_evaluation_id");

-- CreateIndex
CREATE INDEX "Alert_tenant_id_idx" ON "Alert"("tenant_id");

-- CreateIndex
CREATE INDEX "Alert_status_idx" ON "Alert"("status");

-- CreateIndex
CREATE INDEX "Alert_severity_idx" ON "Alert"("severity");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_tenant_id_detection_match_id_key" ON "Alert"("tenant_id", "detection_match_id");

-- CreateIndex
CREATE INDEX "AlertAssignment_tenant_id_idx" ON "AlertAssignment"("tenant_id");

-- CreateIndex
CREATE INDEX "AlertAssignment_alert_id_idx" ON "AlertAssignment"("alert_id");

-- CreateIndex
CREATE INDEX "AlertSuppressionRule_tenant_id_idx" ON "AlertSuppressionRule"("tenant_id");

-- CreateIndex
CREATE INDEX "AlertSuppressionRule_detection_definition_id_idx" ON "AlertSuppressionRule"("detection_definition_id");

-- CreateIndex
CREATE INDEX "AlertSuppressionRule_status_idx" ON "AlertSuppressionRule"("status");

-- CreateIndex
CREATE INDEX "OutboxEvent_tenant_id_idx" ON "OutboxEvent"("tenant_id");

-- CreateIndex
CREATE INDEX "OutboxEvent_published_at_idx" ON "OutboxEvent"("published_at");

-- CreateIndex
CREATE UNIQUE INDEX "InboxEvent_event_id_key" ON "InboxEvent"("event_id");

-- CreateIndex
CREATE INDEX "InboxEvent_tenant_id_idx" ON "InboxEvent"("tenant_id");

-- CreateIndex
CREATE INDEX "Case_tenant_id_idx" ON "Case"("tenant_id");

-- CreateIndex
CREATE INDEX "Case_status_idx" ON "Case"("status");

-- CreateIndex
CREATE INDEX "CaseAlert_tenant_id_idx" ON "CaseAlert"("tenant_id");

-- CreateIndex
CREATE INDEX "CaseAlert_alert_id_idx" ON "CaseAlert"("alert_id");

-- CreateIndex
CREATE INDEX "CaseTransition_tenant_id_idx" ON "CaseTransition"("tenant_id");

-- CreateIndex
CREATE INDEX "CaseTransition_case_id_idx" ON "CaseTransition"("case_id");

-- CreateIndex
CREATE INDEX "CaseTimelineEntry_tenant_id_idx" ON "CaseTimelineEntry"("tenant_id");

-- CreateIndex
CREATE INDEX "CaseTimelineEntry_case_id_idx" ON "CaseTimelineEntry"("case_id");

-- CreateIndex
CREATE INDEX "CaseNote_tenant_id_idx" ON "CaseNote"("tenant_id");

-- CreateIndex
CREATE INDEX "CaseNote_case_id_idx" ON "CaseNote"("case_id");

-- CreateIndex
CREATE INDEX "InvestigationHypothesis_tenant_id_idx" ON "InvestigationHypothesis"("tenant_id");

-- CreateIndex
CREATE INDEX "InvestigationHypothesis_case_id_idx" ON "InvestigationHypothesis"("case_id");

-- CreateIndex
CREATE INDEX "CaseDecision_tenant_id_idx" ON "CaseDecision"("tenant_id");

-- CreateIndex
CREATE INDEX "CaseDecision_case_id_idx" ON "CaseDecision"("case_id");

-- CreateIndex
CREATE INDEX "EvidenceRecord_tenant_id_idx" ON "EvidenceRecord"("tenant_id");

-- CreateIndex
CREATE INDEX "EvidenceRecord_source_system_id_idx" ON "EvidenceRecord"("source_system_id");

-- CreateIndex
CREATE INDEX "CaseEvidence_tenant_id_idx" ON "CaseEvidence"("tenant_id");

-- CreateIndex
CREATE INDEX "CaseEvidence_case_id_idx" ON "CaseEvidence"("case_id");

-- CreateIndex
CREATE INDEX "CaseEvidence_evidence_id_idx" ON "CaseEvidence"("evidence_id");

-- CreateIndex
CREATE INDEX "AlertEvidence_tenant_id_idx" ON "AlertEvidence"("tenant_id");

-- CreateIndex
CREATE INDEX "AlertEvidence_evidence_id_idx" ON "AlertEvidence"("evidence_id");

-- CreateIndex
CREATE INDEX "EvidenceLineage_tenant_id_idx" ON "EvidenceLineage"("tenant_id");

-- CreateIndex
CREATE INDEX "EvidenceLineage_evidence_id_idx" ON "EvidenceLineage"("evidence_id");

-- CreateIndex
CREATE INDEX "EvidenceLineage_parent_evidence_id_idx" ON "EvidenceLineage"("parent_evidence_id");

-- CreateIndex
CREATE INDEX "EvidenceLedgerEntry_tenant_id_idx" ON "EvidenceLedgerEntry"("tenant_id");

-- CreateIndex
CREATE INDEX "EvidenceLedgerEntry_evidence_id_idx" ON "EvidenceLedgerEntry"("evidence_id");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceLedgerEntry_tenant_id_sequence_key" ON "EvidenceLedgerEntry"("tenant_id", "sequence");

-- CreateIndex
CREATE INDEX "ResourceObservation_tenant_id_idx" ON "ResourceObservation"("tenant_id");

-- CreateIndex
CREATE INDEX "ResourceObservation_coverage_state_idx" ON "ResourceObservation"("coverage_state");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceObservation_tenant_id_canonical_resource_id_resourc_key" ON "ResourceObservation"("tenant_id", "canonical_resource_id", "resource_type");

-- CreateIndex
CREATE INDEX "UsageRecord_tenant_id_idx" ON "UsageRecord"("tenant_id");

-- CreateIndex
CREATE INDEX "UsageRecord_usage_state_idx" ON "UsageRecord"("usage_state");

-- CreateIndex
CREATE INDEX "UsageRecord_recorded_at_idx" ON "UsageRecord"("recorded_at");

-- CreateIndex
CREATE INDEX "CommercialAccount_status_idx" ON "CommercialAccount"("status");

-- CreateIndex
CREATE INDEX "CommercialAccount_billing_classification_idx" ON "CommercialAccount"("billing_classification");

-- CreateIndex
CREATE INDEX "Entitlement_tenant_id_idx" ON "Entitlement"("tenant_id");

-- CreateIndex
CREATE INDEX "Entitlement_offer_type_idx" ON "Entitlement"("offer_type");

-- CreateIndex
CREATE INDEX "Entitlement_status_idx" ON "Entitlement"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimRegister_claim_key_key" ON "ClaimRegister"("claim_key");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogVersion_version_label_key" ON "CatalogVersion"("version_label");

-- CreateIndex
CREATE INDEX "CatalogVersion_status_idx" ON "CatalogVersion"("status");

-- CreateIndex
CREATE INDEX "Product_sku_idx" ON "Product"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "Product_catalog_version_id_sku_key" ON "Product"("catalog_version_id", "sku");

-- CreateIndex
CREATE INDEX "PriceBook_status_idx" ON "PriceBook"("status");

-- CreateIndex
CREATE INDEX "PriceBook_product_id_idx" ON "PriceBook"("product_id");

-- CreateIndex
CREATE INDEX "Contract_commercial_account_id_idx" ON "Contract"("commercial_account_id");

-- CreateIndex
CREATE INDEX "Contract_status_idx" ON "Contract"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ProtectedResourceDefinition_resource_type_version_key" ON "ProtectedResourceDefinition"("resource_type", "version");

-- CreateIndex
CREATE INDEX "ServiceObligation_contract_id_idx" ON "ServiceObligation"("contract_id");

-- CreateIndex
CREATE INDEX "ServiceObligation_status_idx" ON "ServiceObligation"("status");

-- CreateIndex
CREATE INDEX "CommercialInvoice_commercial_account_id_idx" ON "CommercialInvoice"("commercial_account_id");

-- CreateIndex
CREATE INDEX "CommercialInvoice_contract_id_idx" ON "CommercialInvoice"("contract_id");

-- CreateIndex
CREATE INDEX "CommercialInvoice_status_idx" ON "CommercialInvoice"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialEvent_idempotency_key_key" ON "CommercialEvent"("idempotency_key");

-- CreateIndex
CREATE INDEX "CommercialEvent_idempotency_key_idx" ON "CommercialEvent"("idempotency_key");

-- CreateIndex
CREATE INDEX "CommercialEvent_event_type_idx" ON "CommercialEvent"("event_type");

-- CreateIndex
CREATE INDEX "AuthorizationDecision_tenant_id_idx" ON "AuthorizationDecision"("tenant_id");

-- CreateIndex
CREATE INDEX "AuthorizationDecision_actor_id_idx" ON "AuthorizationDecision"("actor_id");

-- CreateIndex
CREATE UNIQUE INDEX "AiUseCase_key_key" ON "AiUseCase"("key");

-- CreateIndex
CREATE INDEX "AiUseCase_status_idx" ON "AiUseCase"("status");

-- CreateIndex
CREATE INDEX "ModelProfile_status_idx" ON "ModelProfile"("status");

-- CreateIndex
CREATE INDEX "PromptProfile_status_idx" ON "PromptProfile"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PromptProfile_key_version_key" ON "PromptProfile"("key", "version");

-- CreateIndex
CREATE INDEX "AiOutput_tenant_id_idx" ON "AiOutput"("tenant_id");

-- CreateIndex
CREATE INDEX "AiOutput_use_case_id_idx" ON "AiOutput"("use_case_id");

-- CreateIndex
CREATE INDEX "AiHumanReview_tenant_id_idx" ON "AiHumanReview"("tenant_id");

-- CreateIndex
CREATE INDEX "AiHumanReview_ai_output_id_idx" ON "AiHumanReview"("ai_output_id");

-- CreateIndex
CREATE INDEX "RetrievalBundle_tenant_id_idx" ON "RetrievalBundle"("tenant_id");

-- CreateIndex
CREATE INDEX "RetrievalBundle_case_id_idx" ON "RetrievalBundle"("case_id");

-- CreateIndex
CREATE INDEX "AiToolCall_tenant_id_idx" ON "AiToolCall"("tenant_id");

-- CreateIndex
CREATE INDEX "AiToolCall_tool_name_idx" ON "AiToolCall"("tool_name");

-- CreateIndex
CREATE INDEX "ActionProposal_tenant_id_idx" ON "ActionProposal"("tenant_id");

-- CreateIndex
CREATE INDEX "ActionProposal_case_id_idx" ON "ActionProposal"("case_id");

-- CreateIndex
CREATE INDEX "ActionProposal_status_idx" ON "ActionProposal"("status");

-- CreateIndex
CREATE INDEX "ActionApproval_tenant_id_idx" ON "ActionApproval"("tenant_id");

-- CreateIndex
CREATE INDEX "ActionApproval_proposal_id_idx" ON "ActionApproval"("proposal_id");

-- CreateIndex
CREATE UNIQUE INDEX "ActionCommand_nonce_key" ON "ActionCommand"("nonce");

-- CreateIndex
CREATE INDEX "ActionCommand_tenant_id_idx" ON "ActionCommand"("tenant_id");

-- CreateIndex
CREATE INDEX "ActionCommand_proposal_id_idx" ON "ActionCommand"("proposal_id");

-- CreateIndex
CREATE INDEX "ActionReceipt_tenant_id_idx" ON "ActionReceipt"("tenant_id");

-- CreateIndex
CREATE INDEX "ActionReceipt_action_command_id_idx" ON "ActionReceipt"("action_command_id");

-- CreateIndex
CREATE INDEX "ActionReconciliation_tenant_id_idx" ON "ActionReconciliation"("tenant_id");

-- CreateIndex
CREATE INDEX "ActionReconciliation_action_command_id_idx" ON "ActionReconciliation"("action_command_id");

-- CreateIndex
CREATE UNIQUE INDEX "ActionRateLimit_tenant_id_action_type_target_class_window_key" ON "ActionRateLimit"("tenant_id", "action_type", "target_class", "window");

-- CreateIndex
CREATE INDEX "Freeze_tenant_id_idx" ON "Freeze"("tenant_id");

-- CreateIndex
CREATE INDEX "Freeze_scope_idx" ON "Freeze"("scope");

-- CreateIndex
CREATE UNIQUE INDEX "PlaybookDefinition_key_key" ON "PlaybookDefinition"("key");

-- CreateIndex
CREATE UNIQUE INDEX "PlaybookVersion_playbook_id_version_key" ON "PlaybookVersion"("playbook_id", "version");

-- CreateIndex
CREATE INDEX "PlaybookRun_tenant_id_idx" ON "PlaybookRun"("tenant_id");

-- CreateIndex
CREATE INDEX "PlaybookRun_case_id_idx" ON "PlaybookRun"("case_id");

-- CreateIndex
CREATE UNIQUE INDEX "Framework_key_key" ON "Framework"("key");

-- CreateIndex
CREATE UNIQUE INDEX "FrameworkVersion_framework_id_version_key" ON "FrameworkVersion"("framework_id", "version");

-- CreateIndex
CREATE INDEX "Requirement_framework_version_id_idx" ON "Requirement"("framework_version_id");

-- CreateIndex
CREATE INDEX "Obligation_tenant_id_idx" ON "Obligation"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "ControlObjective_key_key" ON "ControlObjective"("key");

-- CreateIndex
CREATE INDEX "ControlMapping_control_objective_id_idx" ON "ControlMapping"("control_objective_id");

-- CreateIndex
CREATE INDEX "ControlMapping_framework_version_id_idx" ON "ControlMapping"("framework_version_id");

-- CreateIndex
CREATE INDEX "ControlMapping_requirement_id_idx" ON "ControlMapping"("requirement_id");

-- CreateIndex
CREATE INDEX "ControlImplementation_tenant_id_idx" ON "ControlImplementation"("tenant_id");

-- CreateIndex
CREATE INDEX "ControlImplementation_control_objective_id_idx" ON "ControlImplementation"("control_objective_id");

-- CreateIndex
CREATE INDEX "ControlScope_tenant_id_idx" ON "ControlScope"("tenant_id");

-- CreateIndex
CREATE INDEX "ControlScope_control_implementation_id_idx" ON "ControlScope"("control_implementation_id");

-- CreateIndex
CREATE UNIQUE INDEX "ControlTest_control_objective_id_key_key" ON "ControlTest"("control_objective_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ControlTestVersion_control_test_id_version_key" ON "ControlTestVersion"("control_test_id", "version");

-- CreateIndex
CREATE INDEX "ExpectedEvidenceRule_control_test_version_id_idx" ON "ExpectedEvidenceRule"("control_test_version_id");

-- CreateIndex
CREATE INDEX "ExpectedEvidenceResult_tenant_id_idx" ON "ExpectedEvidenceResult"("tenant_id");

-- CreateIndex
CREATE INDEX "ExpectedEvidenceResult_rule_id_idx" ON "ExpectedEvidenceResult"("rule_id");

-- CreateIndex
CREATE INDEX "EvidenceGap_tenant_id_idx" ON "EvidenceGap"("tenant_id");

-- CreateIndex
CREATE INDEX "EvidenceGap_expected_evidence_rule_id_idx" ON "EvidenceGap"("expected_evidence_rule_id");

-- CreateIndex
CREATE UNIQUE INDEX "Evaluator_key_key" ON "Evaluator"("key");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluatorVersion_evaluator_id_version_key" ON "EvaluatorVersion"("evaluator_id", "version");

-- CreateIndex
CREATE INDEX "EvidenceBundle_tenant_id_idx" ON "EvidenceBundle"("tenant_id");

-- CreateIndex
CREATE INDEX "EvidenceBundle_control_test_version_id_idx" ON "EvidenceBundle"("control_test_version_id");

-- CreateIndex
CREATE INDEX "EvaluationRun_tenant_id_idx" ON "EvaluationRun"("tenant_id");

-- CreateIndex
CREATE INDEX "EvaluationRun_control_test_version_id_idx" ON "EvaluationRun"("control_test_version_id");

-- CreateIndex
CREATE INDEX "ManualTestRun_tenant_id_idx" ON "ManualTestRun"("tenant_id");

-- CreateIndex
CREATE INDEX "ManualTestRun_control_test_version_id_idx" ON "ManualTestRun"("control_test_version_id");

-- CreateIndex
CREATE INDEX "Assessment_tenant_id_idx" ON "Assessment"("tenant_id");

-- CreateIndex
CREATE INDEX "Assessment_control_implementation_id_idx" ON "Assessment"("control_implementation_id");

-- CreateIndex
CREATE INDEX "ControlDeficiency_tenant_id_idx" ON "ControlDeficiency"("tenant_id");

-- CreateIndex
CREATE INDEX "ControlDeficiency_assessment_id_idx" ON "ControlDeficiency"("assessment_id");

-- CreateIndex
CREATE INDEX "Risk_tenant_id_idx" ON "Risk"("tenant_id");

-- CreateIndex
CREATE INDEX "RiskFactor_tenant_id_idx" ON "RiskFactor"("tenant_id");

-- CreateIndex
CREATE INDEX "RiskFactor_risk_id_idx" ON "RiskFactor"("risk_id");

-- CreateIndex
CREATE INDEX "RiskTreatment_tenant_id_idx" ON "RiskTreatment"("tenant_id");

-- CreateIndex
CREATE INDEX "RiskTreatment_risk_id_idx" ON "RiskTreatment"("risk_id");

-- CreateIndex
CREATE INDEX "RiskAcceptance_tenant_id_idx" ON "RiskAcceptance"("tenant_id");

-- CreateIndex
CREATE INDEX "RiskAcceptance_risk_id_idx" ON "RiskAcceptance"("risk_id");

-- CreateIndex
CREATE INDEX "Exception_tenant_id_idx" ON "Exception"("tenant_id");

-- CreateIndex
CREATE INDEX "AuditPackage_tenant_id_idx" ON "AuditPackage"("tenant_id");

-- CreateIndex
CREATE INDEX "AuditPackageApproval_tenant_id_idx" ON "AuditPackageApproval"("tenant_id");

-- CreateIndex
CREATE INDEX "AuditPackageApproval_package_id_idx" ON "AuditPackageApproval"("package_id");

-- CreateIndex
CREATE UNIQUE INDEX "AuditPackageManifest_package_id_key" ON "AuditPackageManifest"("package_id");

-- CreateIndex
CREATE INDEX "Checkpoint_tenant_id_idx" ON "Checkpoint"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "Checkpoint_tenant_id_anchor_sequence_key" ON "Checkpoint"("tenant_id", "anchor_sequence");

-- CreateIndex
CREATE UNIQUE INDEX "SigningKey_key_id_key" ON "SigningKey"("key_id");

-- CreateIndex
CREATE INDEX "WitnessReceipt_checkpoint_id_idx" ON "WitnessReceipt"("checkpoint_id");

-- CreateIndex
CREATE UNIQUE INDEX "ReportDefinition_key_key" ON "ReportDefinition"("key");

-- CreateIndex
CREATE INDEX "ReportingProjection_tenant_id_idx" ON "ReportingProjection"("tenant_id");

-- CreateIndex
CREATE INDEX "ReportingProjection_projection_type_idx" ON "ReportingProjection"("projection_type");

-- CreateIndex
CREATE INDEX "ReportingProjection_source_domain_source_object_id_idx" ON "ReportingProjection"("source_domain", "source_object_id");

-- CreateIndex
CREATE INDEX "ReportSnapshot_tenant_id_idx" ON "ReportSnapshot"("tenant_id");

-- CreateIndex
CREATE INDEX "ReportSnapshot_report_definition_id_idx" ON "ReportSnapshot"("report_definition_id");

-- CreateIndex
CREATE INDEX "ExecutiveReportSnapshot_tenant_id_idx" ON "ExecutiveReportSnapshot"("tenant_id");

-- CreateIndex
CREATE INDEX "ExecutiveReportSnapshot_report_snapshot_id_idx" ON "ExecutiveReportSnapshot"("report_snapshot_id");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPolicy_key_key" ON "NotificationPolicy"("key");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationTemplate_key_channel_locale_version_key" ON "NotificationTemplate"("key", "channel", "locale", "version");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_tenant_id_principal_id_notification__key" ON "NotificationPreference"("tenant_id", "principal_id", "notification_policy_id", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationChannelConfig_tenant_id_channel_type_key" ON "NotificationChannelConfig"("tenant_id", "channel_type");

-- CreateIndex
CREATE INDEX "NotificationDelivery_tenant_id_idx" ON "NotificationDelivery"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_event_id_recipient_principal_id_channe_key" ON "NotificationDelivery"("event_id", "recipient_principal_id", "channel", "policy_version");

-- CreateIndex
CREATE INDEX "NotificationAcknowledgement_tenant_id_idx" ON "NotificationAcknowledgement"("tenant_id");

-- CreateIndex
CREATE INDEX "NotificationAcknowledgement_notification_delivery_id_idx" ON "NotificationAcknowledgement"("notification_delivery_id");

-- CreateIndex
CREATE UNIQUE INDEX "ApiClient_client_id_key" ON "ApiClient"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "ApiClient_principal_id_key" ON "ApiClient"("principal_id");

-- CreateIndex
CREATE INDEX "ApiClient_tenant_id_idx" ON "ApiClient"("tenant_id");

-- CreateIndex
CREATE INDEX "ApiClientCredential_tenant_id_idx" ON "ApiClientCredential"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "ApiClientCredential_api_client_id_secret_version_key" ON "ApiClientCredential"("api_client_id", "secret_version");

-- CreateIndex
CREATE INDEX "ApiScopeGrant_tenant_id_idx" ON "ApiScopeGrant"("tenant_id");

-- CreateIndex
CREATE INDEX "ApiScopeGrant_api_client_id_idx" ON "ApiScopeGrant"("api_client_id");

-- CreateIndex
CREATE INDEX "OutboundWebhookSubscription_tenant_id_idx" ON "OutboundWebhookSubscription"("tenant_id");

-- CreateIndex
CREATE INDEX "WebhookSecretVersion_tenant_id_idx" ON "WebhookSecretVersion"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookSecretVersion_webhook_subscription_id_version_key" ON "WebhookSecretVersion"("webhook_subscription_id", "version");

-- CreateIndex
CREATE INDEX "WebhookDelivery_tenant_id_idx" ON "WebhookDelivery"("tenant_id");

-- CreateIndex
CREATE INDEX "WebhookDelivery_webhook_subscription_id_idx" ON "WebhookDelivery"("webhook_subscription_id");

-- CreateIndex
CREATE INDEX "WebhookDeliveryAttempt_delivery_id_idx" ON "WebhookDeliveryAttempt"("delivery_id");

-- CreateIndex
CREATE INDEX "ExportJob_tenant_id_idx" ON "ExportJob"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "ExportJob_tenant_id_idempotency_key_key" ON "ExportJob"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "ExportArtifact_export_job_id_idx" ON "ExportArtifact"("export_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "ExportManifest_export_job_id_key" ON "ExportManifest"("export_job_id");

-- CreateIndex
CREATE INDEX "ExportManifest_tenant_id_idx" ON "ExportManifest"("tenant_id");

-- CreateIndex
CREATE INDEX "LegalHold_tenant_id_idx" ON "LegalHold"("tenant_id");

-- CreateIndex
CREATE INDEX "DeletionRequest_tenant_id_idx" ON "DeletionRequest"("tenant_id");

-- CreateIndex
CREATE INDEX "DeletionTask_deletion_request_id_idx" ON "DeletionTask"("deletion_request_id");

-- CreateIndex
CREATE INDEX "BackupExpiryRecord_deletion_request_id_idx" ON "BackupExpiryRecord"("deletion_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "DeletionAttestation_deletion_request_id_key" ON "DeletionAttestation"("deletion_request_id");

-- CreateIndex
CREATE INDEX "TenantOffboardingRun_tenant_id_idx" ON "TenantOffboardingRun"("tenant_id");

-- AddForeignKey
ALTER TABLE "ConnectorInstance" ADD CONSTRAINT "ConnectorInstance_connectorDefId_fkey" FOREIGN KEY ("connectorDefId") REFERENCES "ConnectorDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorPermission" ADD CONSTRAINT "ConnectorPermission_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ConnectorInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorCredentialReference" ADD CONSTRAINT "ConnectorCredentialReference_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ConnectorInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorCheckpoint" ADD CONSTRAINT "ConnectorCheckpoint_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ConnectorInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorSynchronizationRun" ADD CONSTRAINT "ConnectorSynchronizationRun_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ConnectorInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorHealthStatus" ADD CONSTRAINT "ConnectorHealthStatus_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ConnectorInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorError" ADD CONSTRAINT "ConnectorError_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ConnectorInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookSubscription" ADD CONSTRAINT "WebhookSubscription_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ConnectorInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventHubConsumerCheckpoint" ADD CONSTRAINT "EventHubConsumerCheckpoint_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ConnectorInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuarantinedEvent" ADD CONSTRAINT "QuarantinedEvent_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ConnectorInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawEvent" ADD CONSTRAINT "RawEvent_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "ConnectorInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormalizedEvent" ADD CONSTRAINT "NormalizedEvent_raw_event_id_fkey" FOREIGN KEY ("raw_event_id") REFERENCES "RawEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormalizedEvent" ADD CONSTRAINT "NormalizedEvent_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormalizedEvent" ADD CONSTRAINT "NormalizedEvent_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "IdentityEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetAlias" ADD CONSTRAINT "AssetAlias_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityAlias" ADD CONSTRAINT "IdentityAlias_identity_entity_id_fkey" FOREIGN KEY ("identity_entity_id") REFERENCES "IdentityEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetectionVersion" ADD CONSTRAINT "DetectionVersion_detection_definition_id_fkey" FOREIGN KEY ("detection_definition_id") REFERENCES "DetectionDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetectionEvaluation" ADD CONSTRAINT "DetectionEvaluation_detection_version_id_fkey" FOREIGN KEY ("detection_version_id") REFERENCES "DetectionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetectionEvaluation" ADD CONSTRAINT "DetectionEvaluation_context_snapshot_id_fkey" FOREIGN KEY ("context_snapshot_id") REFERENCES "ContextSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetectionMatch" ADD CONSTRAINT "DetectionMatch_detection_version_id_fkey" FOREIGN KEY ("detection_version_id") REFERENCES "DetectionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetectionReplay" ADD CONSTRAINT "DetectionReplay_original_evaluation_id_fkey" FOREIGN KEY ("original_evaluation_id") REFERENCES "DetectionEvaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetectionReplay" ADD CONSTRAINT "DetectionReplay_detection_version_id_fkey" FOREIGN KEY ("detection_version_id") REFERENCES "DetectionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertAssignment" ADD CONSTRAINT "AlertAssignment_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "Alert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAlert" ADD CONSTRAINT "CaseAlert_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseTransition" ADD CONSTRAINT "CaseTransition_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseTimelineEntry" ADD CONSTRAINT "CaseTimelineEntry_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseNote" ADD CONSTRAINT "CaseNote_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestigationHypothesis" ADD CONSTRAINT "InvestigationHypothesis_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseDecision" ADD CONSTRAINT "CaseDecision_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseEvidence" ADD CONSTRAINT "CaseEvidence_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseEvidence" ADD CONSTRAINT "CaseEvidence_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "EvidenceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvidence" ADD CONSTRAINT "AlertEvidence_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "EvidenceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceLedgerEntry" ADD CONSTRAINT "EvidenceLedgerEntry_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "EvidenceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_commercial_account_id_fkey" FOREIGN KEY ("commercial_account_id") REFERENCES "CommercialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_catalog_version_id_fkey" FOREIGN KEY ("catalog_version_id") REFERENCES "CatalogVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBook" ADD CONSTRAINT "PriceBook_catalog_version_id_fkey" FOREIGN KEY ("catalog_version_id") REFERENCES "CatalogVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBook" ADD CONSTRAINT "PriceBook_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_commercial_account_id_fkey" FOREIGN KEY ("commercial_account_id") REFERENCES "CommercialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_catalog_version_id_fkey" FOREIGN KEY ("catalog_version_id") REFERENCES "CatalogVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceObligation" ADD CONSTRAINT "ServiceObligation_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialInvoice" ADD CONSTRAINT "CommercialInvoice_commercial_account_id_fkey" FOREIGN KEY ("commercial_account_id") REFERENCES "CommercialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialInvoice" ADD CONSTRAINT "CommercialInvoice_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiHumanReview" ADD CONSTRAINT "AiHumanReview_ai_output_id_fkey" FOREIGN KEY ("ai_output_id") REFERENCES "AiOutput"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionApproval" ADD CONSTRAINT "ActionApproval_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "ActionProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionReceipt" ADD CONSTRAINT "ActionReceipt_action_command_id_fkey" FOREIGN KEY ("action_command_id") REFERENCES "ActionCommand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionReconciliation" ADD CONSTRAINT "ActionReconciliation_action_receipt_id_fkey" FOREIGN KEY ("action_receipt_id") REFERENCES "ActionReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybookVersion" ADD CONSTRAINT "PlaybookVersion_playbook_id_fkey" FOREIGN KEY ("playbook_id") REFERENCES "PlaybookDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybookRun" ADD CONSTRAINT "PlaybookRun_playbook_version_id_fkey" FOREIGN KEY ("playbook_version_id") REFERENCES "PlaybookVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FrameworkVersion" ADD CONSTRAINT "FrameworkVersion_framework_id_fkey" FOREIGN KEY ("framework_id") REFERENCES "Framework"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_framework_version_id_fkey" FOREIGN KEY ("framework_version_id") REFERENCES "FrameworkVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlScope" ADD CONSTRAINT "ControlScope_control_implementation_id_fkey" FOREIGN KEY ("control_implementation_id") REFERENCES "ControlImplementation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlTestVersion" ADD CONSTRAINT "ControlTestVersion_control_test_id_fkey" FOREIGN KEY ("control_test_id") REFERENCES "ControlTest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpectedEvidenceRule" ADD CONSTRAINT "ExpectedEvidenceRule_control_test_version_id_fkey" FOREIGN KEY ("control_test_version_id") REFERENCES "ControlTestVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluatorVersion" ADD CONSTRAINT "EvaluatorVersion_evaluator_id_fkey" FOREIGN KEY ("evaluator_id") REFERENCES "Evaluator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskFactor" ADD CONSTRAINT "RiskFactor_risk_id_fkey" FOREIGN KEY ("risk_id") REFERENCES "Risk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskTreatment" ADD CONSTRAINT "RiskTreatment_risk_id_fkey" FOREIGN KEY ("risk_id") REFERENCES "Risk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskAcceptance" ADD CONSTRAINT "RiskAcceptance_risk_id_fkey" FOREIGN KEY ("risk_id") REFERENCES "Risk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditPackageApproval" ADD CONSTRAINT "AuditPackageApproval_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "AuditPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditPackageManifest" ADD CONSTRAINT "AuditPackageManifest_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "AuditPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WitnessReceipt" ADD CONSTRAINT "WitnessReceipt_checkpoint_id_fkey" FOREIGN KEY ("checkpoint_id") REFERENCES "Checkpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationAcknowledgement" ADD CONSTRAINT "NotificationAcknowledgement_notification_delivery_id_fkey" FOREIGN KEY ("notification_delivery_id") REFERENCES "NotificationDelivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiClientCredential" ADD CONSTRAINT "ApiClientCredential_api_client_id_fkey" FOREIGN KEY ("api_client_id") REFERENCES "ApiClient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiScopeGrant" ADD CONSTRAINT "ApiScopeGrant_api_client_id_fkey" FOREIGN KEY ("api_client_id") REFERENCES "ApiClient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookSecretVersion" ADD CONSTRAINT "WebhookSecretVersion_webhook_subscription_id_fkey" FOREIGN KEY ("webhook_subscription_id") REFERENCES "OutboundWebhookSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_webhook_subscription_id_fkey" FOREIGN KEY ("webhook_subscription_id") REFERENCES "OutboundWebhookSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDeliveryAttempt" ADD CONSTRAINT "WebhookDeliveryAttempt_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "WebhookDelivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportArtifact" ADD CONSTRAINT "ExportArtifact_export_job_id_fkey" FOREIGN KEY ("export_job_id") REFERENCES "ExportJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportManifest" ADD CONSTRAINT "ExportManifest_export_job_id_fkey" FOREIGN KEY ("export_job_id") REFERENCES "ExportJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeletionTask" ADD CONSTRAINT "DeletionTask_deletion_request_id_fkey" FOREIGN KEY ("deletion_request_id") REFERENCES "DeletionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackupExpiryRecord" ADD CONSTRAINT "BackupExpiryRecord_deletion_request_id_fkey" FOREIGN KEY ("deletion_request_id") REFERENCES "DeletionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeletionAttestation" ADD CONSTRAINT "DeletionAttestation_deletion_request_id_fkey" FOREIGN KEY ("deletion_request_id") REFERENCES "DeletionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

