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

describe("Spec §31 & §32 Platform Service Health & Readiness Cockpit Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(ZoikoShieldApiClient, "getPlatformReadiness").mockResolvedValue(mockReadinessSnapshot);
    vi.spyOn(ZoikoShieldApiClient, "getDisasterRecoveryBackupStatus").mockResolvedValue(mockDrSummary);
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
});

