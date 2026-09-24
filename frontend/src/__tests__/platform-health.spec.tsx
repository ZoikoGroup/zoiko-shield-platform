import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import PlatformHealthPage from "@/app/admin/platform-health/page";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import {
  PlatformReadinessSnapshot,
  DisasterRecoveryPostureSummary,
  RestoreDrillReceipt,
} from "@/lib/types";

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/admin/platform-health',
  useSearchParams: () => new URLSearchParams(),
}));

const mockReadinessSnapshot: PlatformReadinessSnapshot = {
  snapshotId: "readiness-snap-test-01",
  evaluatedAt: new Date().toISOString(),
  overallState: "READINESS_CONDITIONAL",
  overallScore: 0.98,
  totalServicesCount: 6,
  healthyServicesCount: 5,
  conditionalServicesCount: 1,
  degradedServicesCount: 0,
  g1GateRatified: false,
  activeBlockersCount: 0,
  services: {
    "shield-core": {
      serviceId: "shield-core",
      serviceName: "shield-core",
      displayName: "ZoikoShield Core Identity & Governance Spine",
      description: "Central identity, Cedar authorization, Spec §13 JIT elevation, and multi-tenant session management.",
      version: "1.0.0",
      state: "HEALTHY",
      stateMeaning: "Current evidence supports normal operation within objective and no hidden material gap.",
      readinessScore: 1.0,
      lastAssessedAt: new Date().toISOString(),
      dependencies: [
        { dependencyName: "PostgreSQL SOR", type: "DATABASE", healthy: true, latencyMs: 4, lastChecked: new Date().toISOString() },
      ],
      signals: [
        { signalKey: "jit_elevation_module", label: "JIT Elevation Subsystem", value: "ACTIVE_ENFORCED", status: "OPTIMAL" },
      ],
      blockers: [],
    },
    "shield-ingest": {
      serviceId: "shield-ingest",
      serviceName: "shield-ingest",
      displayName: "High-Throughput Telemetry Ingestion Pipeline",
      description: "Distributed event ingestion, multi-cloud connector ecosystem, schema normalization, and stream deduplication.",
      version: "1.0.0",
      state: "HEALTHY",
      stateMeaning: "Current evidence supports normal operation within objective and no hidden material gap.",
      readinessScore: 1.0,
      lastAssessedAt: new Date().toISOString(),
      dependencies: [
        { dependencyName: "Redpanda / Kafka Ingestion Stream", type: "MESSAGE_BROKER", healthy: true, latencyMs: 12, lastChecked: new Date().toISOString() },
      ],
      signals: [
        { signalKey: "ingestion_lag", label: "Pipeline Lag (ms)", value: "142ms", threshold: "<500ms", status: "OPTIMAL" },
      ],
      blockers: [],
    },
    "shield-ai": {
      serviceId: "shield-ai",
      serviceName: "shield-ai",
      displayName: "AI Security Copilot & Decision Governance Engine",
      description: "Model Armor safety gateways, Spec §16.1 10-field decision envelopes, and Spec §17 domain-differentiated thresholds.",
      version: "1.0.0",
      state: "HEALTHY",
      stateMeaning: "Current evidence supports normal operation within objective and no hidden material gap.",
      readinessScore: 1.0,
      lastAssessedAt: new Date().toISOString(),
      dependencies: [
        { dependencyName: "Vertex AI / LLM Gateway", type: "EXTERNAL_API", healthy: true, latencyMs: 180, lastChecked: new Date().toISOString() },
      ],
      signals: [
        { signalKey: "grounding_score_avg", label: "Mean Grounding Score", value: "0.985", threshold: ">=0.95", status: "OPTIMAL" },
      ],
      blockers: [],
    },
    "shield-action": {
      serviceId: "shield-action",
      serviceName: "shield-action",
      displayName: "SOAR Action Broker & Autonomous Response Engine",
      description: "Automated containment, IAM policy detachment, EDR endpoint isolation, and WAF IP blocking.",
      version: "1.0.0",
      state: "READINESS_CONDITIONAL",
      stateMeaning: "Approved only with bounded conditions and expiry.",
      readinessScore: 0.85,
      lastAssessedAt: new Date().toISOString(),
      dependencies: [
        { dependencyName: "AWS IAM Execution Adapter", type: "EXTERNAL_API", healthy: true, latencyMs: 65, lastChecked: new Date().toISOString() },
      ],
      signals: [
        { signalKey: "g1_launch_gate", label: "G1 Gate Authority (§05/§16)", value: "0/8 FAIL-CLOSED (SIMULATED)", status: "WARNING" },
      ],
      blockers: [],
      operationalConditions: ["G1 Multi-Approver Launch Gate is PENDING (0/8 domain sign-offs). Live R2+ execution adapters operate in fail-closed simulation mode."],
    },
    "shield-anchor": {
      serviceId: "shield-anchor",
      serviceName: "shield-anchor",
      displayName: "Cryptographic Anchor & Immutable Merkle Ledger",
      description: "Post-quantum dual-signing (Dilithium3 + ECDSA P-384), Merkle epoch aggregation, and RFC 3161 timestamps.",
      version: "1.0.0",
      state: "HEALTHY",
      stateMeaning: "Current evidence supports normal operation within objective and no hidden material gap.",
      readinessScore: 1.0,
      lastAssessedAt: new Date().toISOString(),
      dependencies: [
        { dependencyName: "Cloud KMS Sovereign HSM", type: "KMS_HSM", healthy: true, latencyMs: 15, lastChecked: new Date().toISOString() },
      ],
      signals: [
        { signalKey: "pqc_dual_signing", label: "PQC Dual-Signer (ML-DSA / Dilithium3)", value: "ACTIVE_COMPLIANT", status: "OPTIMAL" },
      ],
      blockers: [],
    },
    "verifier-cli": {
      serviceId: "verifier-cli",
      serviceName: "verifier-cli",
      displayName: "Independent Offline Evidence Verifier CLI",
      description: "Zero-trust external verifier binary validating cryptographic proofs independently of backend runtime.",
      version: "1.0.0",
      state: "HEALTHY",
      stateMeaning: "Current evidence supports normal operation within objective and no hidden material gap.",
      readinessScore: 1.0,
      lastAssessedAt: new Date().toISOString(),
      dependencies: [],
      signals: [
        { signalKey: "offline_verification_roundtrip", label: "Offline Round-Trip Verifier", value: "PASSED (0 drift)", status: "OPTIMAL" },
      ],
      blockers: [],
    },
  },
  auditAttestationHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
};

const mockDrSummary: DisasterRecoveryPostureSummary = {
  assessedAt: new Date().toISOString(),
  overallBackupHealth: "HEALTHY",
  overallRpoCompliant: true,
  overallRestoreVerified: true,
  activeStoresCount: 4,
  healthyStoresCount: 4,
  staleBackupsCount: 0,
  unverifiedRestoresCount: 0,
  rtoTargetHours: 4.0,
  stores: {
    shield_core_db: {
      storeId: "shield_core_db",
      displayName: "ZoikoShield Primary Relational State (PostgreSQL)",
      storeType: "RELATIONAL_POSTGRES",
      lastBackupCompletedAt: new Date().toISOString(),
      backupAgeHours: 4.0,
      backupSizeBytes: 52428800,
      rpoTargetMinutes: 15,
      rpoStatus: "COMPLIANT",
      encryptionAlgorithm: "KMS_ENVELOPE_AES256",
      encryptionVerified: true,
      immutabilityLocked: true,
      retentionDays: 90,
      manifestChecksumSha256: "9a5c88b43f9a78de9b3c4a2345e67f890123456789abcdef0123456789abcdef",
      lastRestoreDrillAt: new Date().toISOString(),
      lastRestoreDrillStatus: "VERIFIED",
      restoreDrillAgeDays: 2.0,
    },
    merkle_ledger: {
      storeId: "merkle_ledger",
      displayName: "Immutable Checkpoint & Proof Ledger (RFC3161)",
      storeType: "IMMUTABLE_MERKLE_TREE",
      lastBackupCompletedAt: new Date().toISOString(),
      backupAgeHours: 4.0,
      backupSizeBytes: 12582912,
      rpoTargetMinutes: 5,
      rpoStatus: "COMPLIANT",
      encryptionAlgorithm: "AES_256_GCM",
      encryptionVerified: true,
      immutabilityLocked: true,
      retentionDays: 365,
      manifestChecksumSha256: "8b6d99c54f0b89ef0c4d5b3456f78a90123456789abcdef0123456789abcdef",
      lastRestoreDrillAt: new Date().toISOString(),
      lastRestoreDrillStatus: "VERIFIED",
      restoreDrillAgeDays: 2.0,
    },
    timeseries_telemetry: {
      storeId: "timeseries_telemetry",
      displayName: "Security Event Stream & Telemetry Storage",
      storeType: "TIMESERIES_ANALYTICS",
      lastBackupCompletedAt: new Date().toISOString(),
      backupAgeHours: 4.0,
      backupSizeBytes: 104857600,
      rpoTargetMinutes: 60,
      rpoStatus: "COMPLIANT",
      encryptionAlgorithm: "AES_256_GCM",
      encryptionVerified: true,
      immutabilityLocked: false,
      retentionDays: 30,
      manifestChecksumSha256: "7c7e00d65f1c90fa1d5e6c4567a89b0123456789abcdef0123456789abcdef",
      lastRestoreDrillAt: new Date().toISOString(),
      lastRestoreDrillStatus: "VERIFIED",
      restoreDrillAgeDays: 2.0,
    },
    audit_vault: {
      storeId: "audit_vault",
      displayName: "G1 Evidence & Regulatory Audit Package Vault",
      storeType: "COMPLIANCE_VAULT",
      lastBackupCompletedAt: new Date().toISOString(),
      backupAgeHours: 4.0,
      backupSizeBytes: 20971520,
      rpoTargetMinutes: 1440,
      rpoStatus: "COMPLIANT",
      encryptionAlgorithm: "KMS_ENVELOPE_AES256",
      encryptionVerified: true,
      immutabilityLocked: true,
      retentionDays: 2555,
      manifestChecksumSha256: "6d8f11e76f2d01ab2e6f7d5678b90c123456789abcdef0123456789abcdef",
      lastRestoreDrillAt: new Date().toISOString(),
      lastRestoreDrillStatus: "VERIFIED",
      restoreDrillAgeDays: 2.0,
    },
  },
  attestationDigest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
};

const mockSyntheticData = {
  canaryPosture: {
    canaryTenantId: "tenant-zoiko-canary-01",
    overallHealth: "HEALTHY",
    successRate: 1.0,
    averageLatencyMs: 142,
    lastProbeTimestamp: new Date().toISOString(),
  },
  gameDayPosture: {
    lastExerciseDate: new Date().toISOString(),
    daysSinceLastExercise: 20,
    totalExercisesCompleted: 7,
    overallResilienceScore: 1.0,
    isGameDayScheduleCompliant: true,
    scenariosExercised: [
      { scenario: "GD_01_DEPENDENCY_LOSS" as const, failureClass: "Dependency loss", lastExercised: new Date().toISOString(), status: "PASSED" },
      { scenario: "GD_02_QUEUE_BACKLOG" as const, failureClass: "Queue backlog", lastExercised: new Date().toISOString(), status: "PASSED" },
      { scenario: "GD_03_REGIONAL_FAILURE" as const, failureClass: "Regional failure", lastExercised: new Date().toISOString(), status: "PASSED" },
      { scenario: "GD_04_IDENTITY_OUTAGE" as const, failureClass: "Identity outage", lastExercised: new Date().toISOString(), status: "PASSED" },
      { scenario: "GD_05_AI_OUTAGE" as const, failureClass: "AI outage", lastExercised: new Date().toISOString(), status: "PASSED" },
      { scenario: "GD_06_CONNECTOR_DRIFT" as const, failureClass: "Connector drift", lastExercised: new Date().toISOString(), status: "PASSED" },
      { scenario: "GD_07_ACTION_FREEZE" as const, failureClass: "Action freeze", lastExercised: new Date().toISOString(), status: "PASSED" },
    ],
  },
  recentProbes: [],
  recentExercises: [],
  timestamp: new Date().toISOString(),
};

const mockPhase0Data = {
  postureSummary: {
    lastEvaluatedAt: new Date().toISOString(),
    overallStatus: "PASSED" as const,
    isExitGateSatisfied: true,
    totalRunsCompleted: 14,
    latestProofId: "phase0-proof-test-01",
    merkleRootHead: "f4a8c9e0123456789abcdef0123456789abcdef0123456789abcdef012345678",
    offlineVerificationReady: true,
  },
  latestProof: {
    proofId: "phase0-proof-test-01",
    phaseVersion: "Phase-0-ERB-01" as const,
    documentTitle: "ZoikoShield Phase-0 Exit Gate & Reference Proof Dossier" as const,
    evaluatedAt: new Date().toISOString(),
    overallStatus: "PASSED" as const,
    cellId: "cell-eu-west-1a",
    targetTenantId: "tenant-zoiko-canary-01",
    totalDurationMs: 42,
    stepsCompleted: 8,
    totalSteps: 8,
    criteriaSatisfied: 6,
    totalCriteria: 6,
    merkleRootHead: "f4a8c9e0123456789abcdef0123456789abcdef0123456789abcdef012345678",
    auditPackageChecksum: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    offlineVerificationCommand: "npx zoikoshield-verifier verify ./audit-pkg-phase0-canary-01",
    steps: [
      {
        stepId: "STEP_1_TENANT_PROVISIONING" as const,
        stepNumber: 1,
        name: "Tenant & Cell Isolation Provisioning",
        description: "Cryptographic tenant partition, KMS key ring, and IAM namespace initialized",
        passed: true,
        durationMs: 4,
        evidenceDigest: "a1b2c3d4",
        outputArtifacts: { tenantId: "tenant-zoiko-canary-01" },
      },
      {
        stepId: "STEP_2_AUTHENTICATED_INGESTION" as const,
        stepNumber: 2,
        name: "Authenticated Ingestion & Schema Normalization",
        description: "OCSF-normalized security event ingested with valid Ed25519 signature",
        passed: true,
        durationMs: 5,
        evidenceDigest: "b2c3d4e5",
        outputArtifacts: {},
      },
      {
        stepId: "STEP_3_DETERMINISTIC_DETECTION" as const,
        stepNumber: 3,
        name: "Deterministic Rule Detection & Severity Scoring",
        description: "Rule RULE_CANARY_PRIV_ESC_DETERMINISTIC_01 triggered with zero heuristic drift",
        passed: true,
        durationMs: 6,
        evidenceDigest: "c3d4e5f6",
        outputArtifacts: {},
      },
      {
        stepId: "STEP_4_EVIDENCE_AND_CONTROL" as const,
        stepNumber: 4,
        name: "Evidence Ledger & Continuous Assurance Control Binding",
        description: "Evidence record bound to CTRL_ACCESS_GOVERNANCE_01 with 100% completeness",
        passed: true,
        durationMs: 4,
        evidenceDigest: "d4e5f6a7",
        outputArtifacts: {},
      },
      {
        stepId: "STEP_5_AUDIT_PACKAGE_MERKLE" as const,
        stepNumber: 5,
        name: "Audit Package Merkle Tree Assembly",
        description: "Deterministic 8-leaf Merkle tree compiled with cryptographically valid root",
        passed: true,
        durationMs: 7,
        evidenceDigest: "e5f6a7b8",
        outputArtifacts: {},
      },
      {
        stepId: "STEP_6_WITNESS_ANCHOR_PROOF" as const,
        stepNumber: 6,
        name: "External RFC 3161 Witness Timestamp Anchoring",
        description: "Merkle root attested by trusted timestamp authority with valid signature",
        passed: true,
        durationMs: 6,
        evidenceDigest: "f6a7b8c9",
        outputArtifacts: {},
      },
      {
        stepId: "STEP_7_ACTION_SIMULATION" as const,
        stepNumber: 7,
        name: "Bounded Action Sandbox & Dry-Run Simulation",
        description: "Pre-flight dry-run validated with 0 live mutations and verified blast radius",
        passed: true,
        durationMs: 5,
        evidenceDigest: "a7b8c9d0",
        outputArtifacts: {},
      },
      {
        stepId: "STEP_8_FREEZE_ASSERTION" as const,
        stepNumber: 8,
        name: "Emergency Action Freeze & Circuit Breaker Assertion",
        description: "Kill switch verified responsive in <50ms with live mutation lockdown",
        passed: true,
        durationMs: 5,
        evidenceDigest: "b8c9d0e1",
        outputArtifacts: {},
      },
    ],
    criteria: [
      {
        criteriaId: "CRIT_01_SYNTHETIC_TENANT_ISOLATION" as const,
        name: "Synthetic Tenant Partitioning & KMS Isolation",
        description: "Tenant boundary enforced at database, cache, and KMS level",
        status: "PASSED" as const,
        requiredInvariants: ["INV_CELL_TENANT_ISOLATION", "INV_KMS_RING_RESTRICTED"],
        verifiedAt: new Date().toISOString(),
      },
      {
        criteriaId: "CRIT_02_DETERMINISTIC_DETECTION_VERIFIED" as const,
        name: "Deterministic Detection & Zero-False-Negative Pipeline",
        description: "Canary attack pattern detected with zero false-negative drop",
        status: "PASSED" as const,
        requiredInvariants: ["INV_RULE_CORRELATION_EXACT"],
        verifiedAt: new Date().toISOString(),
      },
      {
        criteriaId: "CRIT_03_EVIDENCE_MERKLE_ANCHORED" as const,
        name: "Evidence Continuous Assurance & Merkle Integrity",
        description: "All generated evidence anchored into canonical Merkle proof tree",
        status: "PASSED" as const,
        requiredInvariants: ["INV_EVIDENCE_CONTROL_MAPPED"],
        verifiedAt: new Date().toISOString(),
      },
      {
        criteriaId: "CRIT_04_OFFLINE_VERIFIER_COMPLIANT" as const,
        name: "Offline Verifier CLI Compatibility",
        description: "Audit package passes offline verifier with 0 external dependencies",
        status: "PASSED" as const,
        requiredInvariants: ["INV_STANDALONE_MERKLE_PROOF"],
        verifiedAt: new Date().toISOString(),
      },
      {
        criteriaId: "CRIT_05_ACTION_SIMULATION_CONSTRAINED" as const,
        name: "Action Sandbox Simulation & Zero Mutation Safety",
        description: "Autonomous SOAR adapters constrained to zero unauthorized mutations",
        status: "PASSED" as const,
        requiredInvariants: ["INV_SIMULATION_ZERO_MUTATION"],
        verifiedAt: new Date().toISOString(),
      },
      {
        criteriaId: "CRIT_06_EMERGENCY_FREEZE_VERIFIED" as const,
        name: "Emergency Action Freeze Sub-Second Lockdown",
        description: "Global kill switch verified responsive in <50ms with instant execution halt",
        status: "PASSED" as const,
        requiredInvariants: ["INV_FREEZE_LOCKDOWN_HONORED"],
        verifiedAt: new Date().toISOString(),
      },
    ],
    releaseGateRatification: {
      eligibleForG1Gate: true,
      attestedByRole: "Principal Security Architect & Release Authority",
      attestedAt: new Date().toISOString(),
    },
    cryptographicProofSignatureSha256: "proof-sha256-test",
  },
};

describe("Spec §31 & §32 Platform Service Health & Readiness Cockpit Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(ZoikoShieldApiClient, "getPlatformReadiness").mockResolvedValue(mockReadinessSnapshot);
    vi.spyOn(ZoikoShieldApiClient, "getDisasterRecoveryBackupStatus").mockResolvedValue(mockDrSummary);
    vi.spyOn(ZoikoShieldApiClient, "getSyntheticObservabilityStatus").mockResolvedValue(mockSyntheticData);
    vi.spyOn(ZoikoShieldApiClient, "getPhase0Status").mockResolvedValue(mockPhase0Data);
  });

  it("renders Spec §31 readiness header and overall platform readiness status", async () => {
    vi.spyOn(ZoikoShieldApiClient, "getPlatformReadiness").mockResolvedValueOnce(mockReadinessSnapshot);

    render(<PlatformHealthPage />);

    expect(
      screen.getByText(/Platform Service Health & Readiness Cockpit/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/SPEC §31 & §32 EXPLICIT SERVICE-HEALTH & READINESS ENGINE/i)
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Overall Platform Readiness/i)).toBeInTheDocument();
      expect(screen.getByText(/Core Services Health Matrix/i)).toBeInTheDocument();
      expect(screen.getByText(/98%/i)).toBeInTheDocument();
    });
  });

  it("renders all 6 core platform backend services in the health matrix", async () => {
    vi.spyOn(ZoikoShieldApiClient, "getPlatformReadiness").mockResolvedValueOnce(mockReadinessSnapshot);

    render(<PlatformHealthPage />);

    await waitFor(() => {
      expect(screen.getByText(/ZoikoShield Core Identity & Governance Spine/i)).toBeInTheDocument();
      expect(screen.getByText(/High-Throughput Telemetry Ingestion Pipeline/i)).toBeInTheDocument();
      expect(screen.getByText(/AI Security Copilot & Decision Governance Engine/i)).toBeInTheDocument();
      expect(screen.getByText(/SOAR Action Broker & Autonomous Response Engine/i)).toBeInTheDocument();
      expect(screen.getByText(/Cryptographic Anchor & Immutable Merkle Ledger/i)).toBeInTheDocument();
      expect(screen.getByText(/Independent Offline Evidence Verifier CLI/i)).toBeInTheDocument();
    });
  });

  it("displays READINESS CONDITIONAL state and G1 fail-closed warning condition for shield-action", async () => {
    vi.spyOn(ZoikoShieldApiClient, "getPlatformReadiness").mockResolvedValueOnce(mockReadinessSnapshot);

    render(<PlatformHealthPage />);

    await waitFor(() => {
      expect(screen.getAllByText(/READINESS CONDITIONAL/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/G1 Multi-Approver Launch Gate is PENDING/i)).toBeInTheDocument();
    });
  });

  it("defensively renders fallback error alert if API fails", async () => {
    vi.spyOn(ZoikoShieldApiClient, "getPlatformReadiness").mockRejectedValueOnce(
      new Error("Readiness telemetry cluster offline")
    );

    render(<PlatformHealthPage />);

    await waitFor(() => {
      expect(screen.getByText(/Readiness telemetry cluster offline/i)).toBeInTheDocument();
    });
  });

  it("renders Spec §26 Disaster Recovery & Backup Integrity panel with all 4 stores", async () => {
    vi.spyOn(ZoikoShieldApiClient, "getPlatformReadiness").mockResolvedValueOnce(mockReadinessSnapshot);
    vi.spyOn(ZoikoShieldApiClient, "getDisasterRecoveryBackupStatus").mockResolvedValueOnce({
      assessedAt: new Date().toISOString(),
      overallBackupHealth: "HEALTHY",
      overallRpoCompliant: true,
      overallRestoreVerified: true,
      activeStoresCount: 4,
      healthyStoresCount: 4,
      staleBackupsCount: 0,
      unverifiedRestoresCount: 0,
      rtoTargetHours: 4.0,
      stores: {
        shield_core_db: {
          storeId: "shield_core_db",
          displayName: "ZoikoShield Primary Relational State (PostgreSQL)",
          storeType: "RELATIONAL_POSTGRES",
          lastBackupCompletedAt: new Date().toISOString(),
          backupAgeHours: 4.0,
          backupSizeBytes: 52428800,
          rpoTargetMinutes: 15,
          rpoStatus: "COMPLIANT",
          encryptionAlgorithm: "KMS_ENVELOPE_AES256",
          encryptionVerified: true,
          immutabilityLocked: true,
          retentionDays: 90,
          manifestChecksumSha256: "9a5c88b43f9a78de9b3c4a2345e67f890123456789abcdef0123456789abcdef",
          lastRestoreDrillAt: new Date().toISOString(),
          lastRestoreDrillStatus: "VERIFIED",
          restoreDrillAgeDays: 2.0,
        },
        merkle_ledger: {
          storeId: "merkle_ledger",
          displayName: "Immutable Checkpoint & Proof Ledger (RFC3161)",
          storeType: "IMMUTABLE_MERKLE_TREE",
          lastBackupCompletedAt: new Date().toISOString(),
          backupAgeHours: 4.0,
          backupSizeBytes: 12582912,
          rpoTargetMinutes: 5,
          rpoStatus: "COMPLIANT",
          encryptionAlgorithm: "AES_256_GCM",
          encryptionVerified: true,
          immutabilityLocked: true,
          retentionDays: 365,
          manifestChecksumSha256: "8b6d99c54f0b89ef0c4d5b3456f78a90123456789abcdef0123456789abcdef",
          lastRestoreDrillAt: new Date().toISOString(),
          lastRestoreDrillStatus: "VERIFIED",
          restoreDrillAgeDays: 2.0,
        },
        timeseries_telemetry: {
          storeId: "timeseries_telemetry",
          displayName: "Security Event Stream & Telemetry Storage",
          storeType: "TIMESERIES_ANALYTICS",
          lastBackupCompletedAt: new Date().toISOString(),
          backupAgeHours: 4.0,
          backupSizeBytes: 104857600,
          rpoTargetMinutes: 60,
          rpoStatus: "COMPLIANT",
          encryptionAlgorithm: "AES_256_GCM",
          encryptionVerified: true,
          immutabilityLocked: false,
          retentionDays: 30,
          manifestChecksumSha256: "7c7e00d65f1c90fa1d5e6c4567a89b0123456789abcdef0123456789abcdef",
          lastRestoreDrillAt: new Date().toISOString(),
          lastRestoreDrillStatus: "VERIFIED",
          restoreDrillAgeDays: 2.0,
        },
        audit_vault: {
          storeId: "audit_vault",
          displayName: "G1 Evidence & Regulatory Audit Package Vault",
          storeType: "COMPLIANCE_VAULT",
          lastBackupCompletedAt: new Date().toISOString(),
          backupAgeHours: 4.0,
          backupSizeBytes: 20971520,
          rpoTargetMinutes: 1440,
          rpoStatus: "COMPLIANT",
          encryptionAlgorithm: "KMS_ENVELOPE_AES256",
          encryptionVerified: true,
          immutabilityLocked: true,
          retentionDays: 2555,
          manifestChecksumSha256: "6d8f11e76f2d01ab2e6f7d5678b90c123456789abcdef0123456789abcdef",
          lastRestoreDrillAt: new Date().toISOString(),
          lastRestoreDrillStatus: "VERIFIED",
          restoreDrillAgeDays: 2.0,
        },
      },
      attestationDigest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    });

    render(<PlatformHealthPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/Disaster Recovery, Backup & Integrity Reconciliation \(Spec §26\)/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/ZoikoShield Primary Relational State \(PostgreSQL\)/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Immutable Checkpoint & Proof Ledger \(RFC3161\)/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Execute Restore Drill/i)
      ).toBeInTheDocument();
    });
  });

  it("triggers on-demand restore drill and displays verified drill receipt", async () => {
    vi.spyOn(ZoikoShieldApiClient, "getPlatformReadiness").mockResolvedValue(mockReadinessSnapshot);
    vi.spyOn(ZoikoShieldApiClient, "getDisasterRecoveryBackupStatus").mockResolvedValue(mockDrSummary);

    vi.spyOn(ZoikoShieldApiClient, "runRestoreDrill").mockResolvedValueOnce({
      drillId: "drill-test-verified-01",
      storeId: "shield_core_db",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 42,
      durationSeconds: 0.042,
      rtoTargetSeconds: 14400,
      rtoCompliant: true,
      status: "VERIFIED",
      scratchSchemaName: "scratch_restore_test_01",
      scratchSchemaTornDown: true,
      totalTablesReconciled: 6,
      totalRowsReconciled: 1326,
      sourceMerkleHead: "a1b2c3d4e5f67890123456789abcdef0",
      restoredMerkleHead: "a1b2c3d4e5f67890123456789abcdef0",
      merkleHeadAligned: true,
      tableReconciliations: [],
      discrepancies: [],
      receiptSignatureSha256: "f5d1e2c3b4a59687",
    });

    render(<PlatformHealthPage />);

    await waitFor(() => {
      expect(screen.getByText(/Execute Restore Drill/i)).toBeInTheDocument();
    });

    const drillButton = screen.getByText(/Execute Restore Drill/i);
    drillButton.click();

    await waitFor(() => {
      expect(screen.getByText(/RESTORE DRILL VERIFIED/i)).toBeInTheDocument();
      expect(screen.getByText(/drill-test-verified-01/i)).toBeInTheDocument();
      expect(screen.getByText(/1326 records \(0 drift\)/i)).toBeInTheDocument();
    });
  });

  it("renders Spec §28 Phase-0 Exit Gate Cockpit with 8 pipeline steps and 6 criteria", async () => {
    render(<PlatformHealthPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/Phase-0 Exit Gate & Independent Reference Proof Cockpit/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/Spec §28 Compliant/i)).toBeInTheDocument();
      expect(screen.getByText(/Tenant & Cell Isolation Provisioning/i)).toBeInTheDocument();
      expect(screen.getByText(/Emergency Action Freeze & Circuit Breaker Assertion/i)).toBeInTheDocument();
      expect(screen.getByText(/Synthetic Tenant Partitioning & KMS Isolation/i)).toBeInTheDocument();
      expect(screen.getByText(/Offline Verifier CLI Compatibility/i)).toBeInTheDocument();
    });
  });

  it("triggers Phase-0 reference flow and offline CLI verification simulation", async () => {
    vi.spyOn(ZoikoShieldApiClient, "executePhase0Flow").mockResolvedValueOnce({
      ...mockPhase0Data.latestProof,
      proofId: "phase0-proof-fresh-02",
      totalDurationMs: 45,
    });

    vi.spyOn(ZoikoShieldApiClient, "getPhase0ProofBundle").mockResolvedValueOnce({
      manifest: {
        manifestVersion: "1.0.0",
        specReference: "Spec §28",
        packageId: "pkg-phase0-fresh-02",
        tenantId: "tenant-zoiko-canary-01",
        cellId: "cell-eu-west-1a",
        exportedAt: new Date().toISOString(),
        merkleRootHead: "f4a8c9e0",
        auditPackageChecksum: "e3b0c442",
        proofSignatureSha256: "sig-fresh-02",
        artifactChecksums: {},
      },
      proofRecord: mockPhase0Data.latestProof as any,
      merkleTreeData: {
        rootHash: "f4a8c9e0",
        totalLeaves: 8,
        leaves: [],
        witnessAttestation: {
          provider: "RFC_3161_TSA",
          witnessHash: "wit-fresh-02",
          timestampIso: new Date().toISOString(),
          signatureValid: true,
        },
      },
      evidenceChain: {
        evidenceId: "ev-fresh-02",
        controlId: "CTRL_ACCESS_GOVERNANCE_01",
        controlAssessment: "SATISFIED",
        completenessRatio: 1.0,
        detectionAlertId: "alt-fresh-02",
        ruleId: "RULE_CANARY_PRIV_ESC_DETERMINISTIC_01",
      },
      actionSandboxReceipt: {
        simulationId: "sim-fresh-02",
        actionName: "ISOLATE_CREDENTIALS",
        blastRadius: "CONFINED_SINGLE_USER",
        liveMutationsCount: 0,
        freezeSwitchFunctional: true,
      },
      offlineVerificationInstructions: {
        cliCommand: "npx zoikoshield-verifier verify ./pkg-phase0-fresh-02",
        offlineMode: true,
        expectedExitCode: 0,
      },
    });

    vi.spyOn(ZoikoShieldApiClient, "verifyProofOffline").mockResolvedValueOnce({
      verified: true,
      verificationTimestamp: new Date().toISOString(),
      packageId: "pkg-phase0-fresh-02",
      merkleRootMatches: true,
      evidenceChainIntact: true,
      signatureMatches: true,
      invariantsPassed: 6,
      totalInvariants: 6,
      discrepancies: [],
      verificationCertificate: {
        certificateId: "cert-pkg-phase0-fresh-02",
        verifierVersion: "zoikoshield-verifier-v1.0",
        signatureSha256: "cert-sig-fresh-02",
      },
    });

    render(<PlatformHealthPage />);

    await waitFor(() => {
      expect(screen.getByText(/Run Phase-0 Verification Flow/i)).toBeInTheDocument();
      expect(screen.getByText(/Verify Offline CLI/i)).toBeInTheDocument();
    });

    const verifyCliButton = screen.getByText(/Verify Offline CLI/i);
    verifyCliButton.click();

    await waitFor(() => {
      expect(screen.getByText(/Standalone Verifier Report: pkg-phase0-fresh-02/i)).toBeInTheDocument();
      expect(screen.getByText(/VERIFIED \(100% INTACT\)/i)).toBeInTheDocument();
    });
  });
});


