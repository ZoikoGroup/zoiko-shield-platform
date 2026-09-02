import {
  Tenant,
  UserSession,
  TeamMember,
  Invitation,
  Connector,
  TelemetryNormalized,
  Alert,
  Case,
  EvidenceRecord,
  ControlTest,
  AuditPackage,
  JitElevationSession,
  EnclaveAttestationReceipt,
} from "./types";
import { useState, useEffect } from "react";

export interface DemoState {
  currentStep: number;
  session: UserSession;
  tenant: Tenant;
  team: TeamMember[];
  invitations: Invitation[];
  connectors: Connector[];
  normalizedEvents: TelemetryNormalized[];
  alerts: Alert[];
  cases: Case[];
  controlTests: ControlTest[];
  auditPackages: AuditPackage[];
  jitSessions: JitElevationSession[];
  enclaveAttestation?: EnclaveAttestationReceipt;
  lastSimulatedEvent?: Record<string, unknown>;
}

const STATIC_TIMESTAMP = "2026-09-02T08:00:00.000Z";

const DEFAULT_TENANT: Tenant = {
  id: "00000000-0000-4000-8000-000000000001",
  orderId: "ord-enterprise-00000001-uuid",
  organizationName: "Acme Financial Services Inc.",
  slug: "acme-financial",
  legalEntityName: "Acme Financial Services Global Ltd",
  environmentName: "PRODUCTION-US-EAST",
  homeRegion: "us-east-1",
  dataResidencyRegion: "us-east-1",
  dataClass: "RESTRICTED",
  accessDisclosureVersion: "1.0.0",
  status: "ACTIVE",
  createdAt: STATIC_TIMESTAMP,
};

const DEFAULT_SESSION: UserSession = {
  userId: "usr-sarah-chen-01",
  email: "sarah.chen@acme.com",
  fullName: "Sarah Chen (Lead Analyst)",
  role: "TENANT_OWNER",
  tenantId: DEFAULT_TENANT.id,
  environment: "PRODUCTION-US-EAST",
  token: "demo-jwt-session-token-998811",
  isAuthenticated: true,
};

const INITIAL_TEAM: TeamMember[] = [
  {
    id: "usr-sarah-chen-01",
    email: "sarah.chen@acme.com",
    fullName: "Sarah Chen",
    role: "TENANT_OWNER",
    status: "ACTIVE",
    joinedAt: "2026-08-01T08:00:00.000Z",
  },
  {
    id: "usr-marcus-vance-02",
    email: "marcus.vance@acme.com",
    fullName: "Marcus Vance",
    role: "SECURITY_ANALYST",
    status: "ACTIVE",
    joinedAt: "2026-08-20T08:00:00.000Z",
  },
];

const INITIAL_CONNECTORS: Connector[] = [
  {
    id: "conn-webhook-gateway-01",
    tenantId: DEFAULT_TENANT.id,
    name: "Primary Security Gateway Webhook",
    provider: "generic-webhook",
    sourceRegion: "us-east-1",
    status: "ACTIVE",
    healthStatus: "HEALTHY",
    hmacSecret: "whsec_99a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4",
    webhookUrl: "https://ingest.zoikoshield.io/api/v1/ingestion/webhooks/conn-webhook-gateway-01",
    eventsIngestedCount: 1420,
    lastEventAt: STATIC_TIMESTAMP,
  },
  {
    id: "conn-entra-id-prod",
    tenantId: DEFAULT_TENANT.id,
    name: "Microsoft Entra ID / Graph Audit Connector",
    provider: "microsoft-entra",
    sourceRegion: "us-east-1",
    status: "ACTIVE",
    healthStatus: "HEALTHY",
    hmacSecret: "entra_audit_graph_secret_7721",
    webhookUrl: "https://ingest.zoikoshield.io/api/v1/ingestion/entra/conn-entra-id-prod",
    eventsIngestedCount: 8940,
    lastEventAt: STATIC_TIMESTAMP,
  },
  {
    id: "conn-crowdstrike-fdr",
    tenantId: DEFAULT_TENANT.id,
    name: "CrowdStrike Falcon FDR Stream",
    provider: "crowdstrike-edr",
    sourceRegion: "us-east-1",
    status: "ACTIVE",
    healthStatus: "HEALTHY",
    hmacSecret: "cs_fdr_streaming_secret_5519",
    webhookUrl: "https://ingest.zoikoshield.io/api/v1/ingestion/crowdstrike/conn-crowdstrike-fdr",
    eventsIngestedCount: 18230,
    lastEventAt: STATIC_TIMESTAMP,
  },
];

const INITIAL_CONTROLS: ControlTest[] = [
  {
    id: "ctrl-01",
    controlId: "SOC2-CC6.1",
    framework: "SOC2_TYPE2",
    controlName: "Privileged Access Restriction & MFA Enforcement",
    description: "Evaluates whether all privileged administrative sessions enforce hardware MFA step-up and JIT approval.",
    category: "IDENTITY_ACCESS",
    result: "PASS",
    evaluatedEventsCount: 412,
    lastEvaluatedAt: STATIC_TIMESTAMP,
    evidenceSampleHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  {
    id: "ctrl-02",
    controlId: "SOC2-CC6.6",
    framework: "SOC2_TYPE2",
    controlName: "Boundary Protection & Logical Isolation",
    description: "Evaluates multi-tenant cryptographic key isolation and boundary enforcement.",
    category: "NETWORK_ISOLATION",
    result: "PASS",
    evaluatedEventsCount: 290,
    lastEvaluatedAt: STATIC_TIMESTAMP,
    evidenceSampleHash: "3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b",
  },
  {
    id: "ctrl-03",
    controlId: "SOC2-CC7.2",
    framework: "SOC2_TYPE2",
    controlName: "Security Incident Anomaly Detection",
    description: "Verifies anomalous telemetry bursts trigger automated P1 detections within 60-second window.",
    category: "INCIDENT_RESPONSE",
    result: "PASS",
    evaluatedEventsCount: 88,
    lastEvaluatedAt: STATIC_TIMESTAMP,
    evidenceSampleHash: "b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2",
  },
  {
    id: "ctrl-04",
    controlId: "ISO27001-A.5.15",
    framework: "ISO27001_2022",
    controlName: "Access Control & Role-Based Segregation",
    description: "Enforces least privilege and dual-custody verification on platform administrative operations.",
    category: "IDENTITY_ACCESS",
    result: "PASS",
    evaluatedEventsCount: 165,
    lastEvaluatedAt: STATIC_TIMESTAMP,
    evidenceSampleHash: "c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2",
  },
  {
    id: "ctrl-05",
    controlId: "ISO27001-A.8.16",
    framework: "ISO27001_2022",
    controlName: "Monitoring Activities & Merkle Epoch Checkpointing",
    description: "Verifies all security incident logs are permanently sealed into cryptographic Merkle trees.",
    category: "CONTINUOUS_AUDIT",
    result: "PASS",
    evaluatedEventsCount: 520,
    lastEvaluatedAt: STATIC_TIMESTAMP,
    evidenceSampleHash: "d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2",
  },
];

export function getDefaultStaticState(): DemoState {
  const initialAlertId = "alt-failed-login-bruteforce-01";
  const initialCaseId = "case-2026-auth-attack-01";
  const initialEvidenceId = "ev-telemetry-payload-01";

  const initialEvidence: EvidenceRecord = {
    id: initialEvidenceId,
    tenantId: DEFAULT_TENANT.id,
    caseId: initialCaseId,
    evidenceType: "SECURITY_TELEMETRY",
    sourceType: "WEBHOOK",
    collectorId: INITIAL_CONNECTORS[0].id,
    contentHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    freshnessStatus: "CURRENT",
    integrityStatus: "VALID",
    merkleEpoch: 1042,
    merkleRootHash: "7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b",
    recordedAt: "2026-09-02T07:00:00.000Z",
    rawPayload: {
      eventId: "evt-raw-failed-auth-99",
      eventType: "user.authentication.failure",
      sourceIp: "198.51.100.42",
      targetUser: "victim.engineer@acme.com",
      attempts: 5,
      threatSignature: "T1110.001 - Password Spraying",
    },
  };

  const initialCase: Case = {
    id: initialCaseId,
    tenantId: DEFAULT_TENANT.id,
    title: "Investigation: Repeated Failed Logins & Credential Stuffing Burst",
    severity: "HIGH",
    status: "INVESTIGATING",
    ownerId: DEFAULT_SESSION.userId,
    ownerName: DEFAULT_SESSION.fullName,
    createdAt: "2026-09-02T07:00:00.000Z",
    updatedAt: "2026-09-02T08:00:00.000Z",
    linkedAlertIds: [initialAlertId],
    timeline: [
      {
        id: "tl-01",
        timestamp: "2026-09-02T07:00:00.000Z",
        title: "Detection Rule Triggered",
        description: "Rule 'Repeated Failed Logins' detected 5 failed attempts from 198.51.100.42 within 60s.",
        actor: "shield-ingest / TierA-Windowed-Detector",
        type: "ALERT_TRIGGERED",
      },
      {
        id: "tl-02",
        timestamp: "2026-09-02T07:10:00.000Z",
        title: "Alert Promoted to Case",
        description: "Security Analyst Sarah Chen triaged P1 alert and initiated formal investigation case.",
        actor: "Sarah Chen (Lead Analyst)",
        type: "CASE_OPENED",
      },
      {
        id: "tl-03",
        timestamp: "2026-09-02T07:20:00.000Z",
        title: "Cryptographic Evidence Recorded",
        description: "SHA-256 evidence record anchored to Merkle Epoch #1042 (e3b0c44298fc1c14...).",
        actor: "shield-anchor / BatchMerkleCheckpointer",
        type: "EVIDENCE_RECORDED",
      },
      {
        id: "tl-04",
        timestamp: "2026-09-02T07:30:00.000Z",
        title: "Autonomous AI Investigation Generated",
        description: "AI Copilot synthesized attack narrative with 1 verified evidence citation and Model Armor safe verdict.",
        actor: "shield-ai / ModelArmorGateway",
        type: "AI_INVESTIGATED",
      },
    ],
    evidenceList: [initialEvidence],
    aiSummary: {
      aiRunId: "ai-run-auth-investigation-01",
      caseId: initialCaseId,
      status: "REVIEW_REQUIRED",
      generatedAt: "2026-09-02T07:30:00.000Z",
      modelArmorVerdict: "SCREENED_SAFE",
      executiveSummary:
        "High-confidence credential stuffing attack detected targeting 'victim.engineer@acme.com'. An external IP (198.51.100.42) generated 5 rapid authentication failures against the US-East Auth Gateway. The source IP is associated with known brute-force Botnet nodes.",
      threatAssessment:
        "MITRE ATT&CK T1110 (Brute Force) & T1078 (Valid Accounts). Immediate credential rotation and active session termination recommended.",
      citations: [
        {
          evidenceId: initialEvidenceId,
          evidenceRef: "[E-01]",
          description: "Raw Auth Webhook Payload (SHA-256: e3b0c44298fc...)",
        },
      ],
      hypotheses: [
        {
          id: "hyp-01",
          title: "Automated Distributed Credential Stuffing",
          likelihood: "HIGH",
          supportingEvidence: [
            "5 failed login attempts in under 60 seconds",
            "Known proxy IP address (198.51.100.42)",
            "Target account matches corporate directory format",
          ],
        },
        {
          id: "hyp-02",
          title: "Legitimate User Password Fatigue",
          likelihood: "LOW",
          supportingEvidence: [
            "IP address geolocation does not match user home region",
          ],
        },
      ],
      recommendedActions: [
        "Revoke all active sessions for victim.engineer@acme.com",
        "Enforce FIDO2 WebAuthn step-up authentication on next login",
        "Block source IP 198.51.100.42 at the WAF edge perimeter",
      ],
      limitations: [
        "Source ASN reputation data is based on a 24-hour lookback window.",
      ],
    },
    decision: {
      id: "dec-auth-contain-01",
      tenantId: DEFAULT_TENANT.id,
      caseId: initialCaseId,
      decisionType: "INCIDENT_DECLARATION",
      decisionNotes:
        "Confirmed hostile brute-force attack from external IP. Approving session invalidation recommendation.",
      actorId: DEFAULT_SESSION.userId,
      actorName: DEFAULT_SESSION.fullName,
      evidenceIds: [initialEvidenceId],
      timestamp: "2026-09-02T07:40:00.000Z",
    },
    responseProposal: {
      id: "prop-reset-sessions-01",
      tenantId: DEFAULT_TENANT.id,
      caseId: initialCaseId,
      actionType: "RESET_USER_SESSIONS",
      targetAsset: "victim.engineer@acme.com",
      authorityLevel: "R1_RECOMMEND",
      status: "SIMULATED",
      proposedAt: "2026-09-02T07:45:00.000Z",
      simulatedAt: "2026-09-02T07:50:00.000Z",
      blastRadiusScore: 0.05,
    },
    simulationReceipt: {
      id: "rcpt-sim-session-reset-99",
      proposalId: "prop-reset-sessions-01",
      commandId: "cmd-revocation-synthetic-01",
      result: "SIMULATED",
      simulatedBlastRadius: 0.05,
      simulatedAt: "2026-09-02T07:50:00.000Z",
      stateDiffs: [
        {
          target: "victim.engineer@acme.com",
          beforeState: "ActiveSessions=3, LastMfa=2h_ago",
          afterState: "ActiveSessions=0, NextLoginMfaRequired=true",
          rollbackCommand: "RESTORE_USER_SESSION_CACHE",
        },
      ],
      observedEffect: {
        sessionsTerminated: 3,
        tokensRevoked: ["jwt_sess_1", "jwt_sess_2", "jwt_sess_3"],
        collateralDamageRisk: "ZERO_COLLATERAL",
      },
      safetyAttestationHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    },
  };

  const initialAlert: Alert = {
    id: initialAlertId,
    tenantId: DEFAULT_TENANT.id,
    detectionRuleId: "rule-threshold-failed-logins",
    detectionRuleVersion: 1,
    title: "Repeated Failed Login Attempts Detected",
    severity: "HIGH",
    priority: "P1",
    status: "CASE_CREATED",
    sourceEventIds: ["evt-raw-failed-auth-99"],
    affectedAssets: ["auth-gateway-us-east-1"],
    affectedIdentities: ["victim.engineer@acme.com"],
    mitreTechnique: "T1110.001 - Password Spraying",
    createdAt: "2026-09-02T07:00:00.000Z",
  };

  const initialAuditPackage: AuditPackage = {
    id: "pkg-audit-2026-acme-q3",
    tenantId: DEFAULT_TENANT.id,
    packageName: "ZoikoShield-Audit-Package-Acme-Q3.zip",
    packageHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    dilithiumSignature: "pqc_dilithium3_sig_7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a",
    ed25519Signature: "ed25519_sig_3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
    status: "VERIFIED",
    generatedAt: "2026-09-02T07:55:00.000Z",
    sizeBytes: 418290,
    manifest: {
      evidenceCount: 14,
      casesCount: 3,
      controlEvaluationsCount: 5,
      epochMerkleRoot: "7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b",
      tsaTimestampProof: "RFC3161_TSA_SEALED_DIGEST_2026_09_02_VALID",
    },
  };

  return {
    currentStep: 1,
    session: DEFAULT_SESSION,
    tenant: DEFAULT_TENANT,
    team: INITIAL_TEAM,
    invitations: [],
    connectors: INITIAL_CONNECTORS,
    normalizedEvents: [],
    alerts: [initialAlert],
    cases: [initialCase],
    controlTests: INITIAL_CONTROLS,
    auditPackages: [initialAuditPackage],
    jitSessions: [
      {
        sessionId: "jit-sess-sec-admin-991",
        operatorId: DEFAULT_SESSION.userId,
        targetTenantId: DEFAULT_TENANT.id,
        elevatedRole: "SUPER_ADMIN",
        status: "ACTIVE",
        clientIp: "198.51.100.25",
        statedPurpose: "Platform Support & Emergency Incident Remediation for Case #2026-01",
        issuedAt: "2026-09-02T07:50:00.000Z",
        expiresAt: "2026-09-02T08:50:00.000Z",
        hardwareStepUpVerified: true,
        peerApprover: "sec-director@acme.com",
      },
    ],
    enclaveAttestation: {
      receiptId: "enclave-receipt-nitro-pqc-01",
      enclaveId: "aws-nitro-enclave-us-east-1a",
      platform: "AWS_NITRO",
      pcr0: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      eatId: "eat-nitro-verified-token-88412",
      status: "VALID",
      verifiedAt: STATIC_TIMESTAMP,
    },
  };
}

export function getInitialDemoState(): DemoState {
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem("zoikoshield_demo_state");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // Fallback
    }
  }
  return getDefaultStaticState();
}

export function saveDemoState(state: DemoState) {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("zoikoshield_demo_state", JSON.stringify(state));
      window.dispatchEvent(new Event("demo-state-updated"));
    } catch {
      // Storage full / private mode
    }
  }
}

export function resetDemoState(): DemoState {
  const initial = getDefaultStaticState();
  if (typeof window !== "undefined") {
    localStorage.removeItem("zoikoshield_demo_state");
    window.dispatchEvent(new Event("demo-state-updated"));
  }
  return initial;
}

export function useDemoState(): [DemoState, (state: DemoState) => void, boolean] {
  const [state, setState] = useState<DemoState>(getDefaultStaticState);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setState(getInitialDemoState());
    setIsHydrated(true);

    const handleUpdate = () => setState(getInitialDemoState());
    window.addEventListener("demo-state-updated", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("demo-state-updated", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  const setDemoState = (newState: DemoState) => {
    setState(newState);
    saveDemoState(newState);
  };

  return [state, setDemoState, isHydrated];
}
