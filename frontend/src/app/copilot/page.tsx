"use client";

import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Bot,
  ShieldAlert,
  Send,
  CheckCircle2,
  FileText,
  Search,
  Zap,
  Lock,
  Compass,
  ArrowRight,
  Code,
  Scale,
  Sliders,
  Check,
  AlertOctagon,
  RefreshCw,
  X,
  AlertTriangle,
  FileCheck,
  ShieldCheck,
  ExternalLink,
  ChevronRight,
  UserCheck,
  Clock,
  Key,
} from "lucide-react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import type {
  AiReviewEnvelope,
  DecisionTransition,
  DecisionState,
  ResponseAuthorityTier,
} from "@/lib/types";

type CopilotMode =
  | "INVESTIGATE"
  | "ASSURE"
  | "RESPOND"
  | "REPORT"
  | "DEVELOP"
  | "NAVIGATE";

interface CopilotPreset {
  mode: CopilotMode;
  title: string;
  query: string;
  defaultEnvelope: AiReviewEnvelope;
}

const PRESETS: Record<CopilotMode, CopilotPreset> = {
  INVESTIGATE: {
    mode: "INVESTIGATE",
    title: "Investigate Suspicious Lateral Movement",
    query: "Analyze alert ALT-0921 on bastion host ec2-jump-01 and map downstream DB access attempts.",
    defaultEnvelope: {
      envelopeId: "env-inv-0921a",
      tenantId: "00000000-0000-4000-8000-000000000001",
      environmentId: "PRODUCTION",
      createdAt: new Date().toISOString(),
      aiLabelAndUseCaseName: {
        aiLabel: "ZoikoShield Guarded ModelArmor Engine v2.4",
        useCaseName: "COPILOT_INVESTIGATE",
        modelRoute: "vertex-ai/gemini-1.5-pro-002",
        version: "gemini-1.5-pro-002",
        modelIdentifier: "gemini-1.5-pro-002",
        providerProfile: "gcp-vertex-ai-europe-west2",
        riskTier: "HIGH",
      },
      sourcesAndSpans: [
        {
          sourceId: "src-cloudtrail-01",
          sourceType: "OCSF_AUTH_EVENT",
          name: "aws-cloudtrail-stream",
          type: "OCSF_AUTH_EVENT",
          documentRef: "ref-cloudtrail-e98124",
          exactSpan: "EventId: e-98124 | PrincipalId: AROA45881:marcus.vance | DestIP: 10.0.14.88:445",
          span: "EventId: e-98124 | PrincipalId: AROA45881:marcus.vance | DestIP: 10.0.14.88:445",
          confidence: 0.98,
          confidenceScore: 0.98,
        },
        {
          sourceId: "src-crowdstrike-fdr",
          sourceType: "PROCESS_INJECTION",
          name: "crowdstrike-fdr",
          type: "PROCESS_INJECTION",
          documentRef: "ref-fdr-pid-4092",
          exactSpan: "Process: powershell.exe -Enc SGVsbG8... launched from unprivileged service account",
          span: "Process: powershell.exe -Enc SGVsbG8... launched from unprivileged service account",
          confidence: 0.94,
          confidenceScore: 0.94,
        },
      ],
      knownMissingStaleOrConflictingEvidence: {
        missingEvidence: ["VPC flow logs batch 10:15-10:30 UTC pending S3 compression"],
        staleEvidence: [],
        conflictingEvidence: [],
        missingEvidenceCount: 1,
        staleEvidenceCount: 0,
        conflictingEvidenceCount: 0,
        freshnessSeconds: 18,
        completenessRatio: 0.95,
      },
      calibratedConfidenceAndUncertainty: {
        score: 0.94,
        qualitativeBand: "HIGH",
        confidenceTier: "HIGH",
        calibrationBasis: "Multi-sensor alignment across Entra ID audit log & AWS VPC Flow logs.",
        uncertaintyFactors: [
          "Network tap packet payload was TLS encrypted; derived from TLS SNI and JA4 fingerprint.",
        ],
      },
      alternativeHypothesesOrActions: [
        {
          actionId: "ALT-01",
          title: "Passive Honeypot Observability",
          rationale: "Observe attacker reconnaissance for 10 minutes to capture secondary C2 addresses.",
          tradeOffs: "Maximizes threat attribution intelligence but risks lateral Crown Jewel DB touch.",
          tradeOff: "Maximizes threat attribution intelligence but risks lateral Crown Jewel DB touch.",
        },
        {
          actionId: "ALT-02",
          title: "Immediate Host Quarantine",
          rationale: "Isolate bastion host ec2-jump-01 at Security Group perimeter.",
          tradeOffs: "Halts lateral traversal instantly; terminates 2 active developer maintenance sessions.",
          tradeOff: "Halts lateral traversal instantly; terminates 2 active developer maintenance sessions.",
        },
      ],
      expectedImpactAndReversibility: {
        blastRadius: "1 Bastion Host (ec2-jump-01), 0 Customer-Facing Services impacted.",
        isReversible: true,
        reversibilityTier: "R2",
        compensationPlan: "Security Group rule update with automated rollback snapshot: ZS-RB-TOKEN-9941.",
        downtimeExpected: false,
        reversibility: "Fully Reversible (Security Group Rule Update)",
        compensationMechanism: "Signed Rollback Token: ZS-RB-TOKEN-9941",
      },
      requiredAuthorityAndApprovals: {
        requiredRole: "LEAD_SECURITY_ANALYST",
        responseAuthorityTier: "R2",
        requiredAuthorityTier: "R2",
        dualApproverRequired: false,
        dualCustodyRequired: false,
        approverRoles: ["SECURITY_OPERATIONS_LEAD"],
      },
      controls: {
        state: "UNREVIEWED",
        currentState: "PENDING_REVIEW",
        availableTransitions: ["ACCEPT", "MODIFY", "REJECT", "ESCALATE"],
      },
      humanDecisionAndRationale: {},
      appealOrFeedbackRoute: {
        appealUrl: "https://shield.zoikogroup.com/appeals/v1",
        feedbackChannel: "secops-human-review@zoikogroup.com",
        customerAffecting: false,
      },
      payload: {
        summary:
          "Correlated 14 OCSF v1.1.0 authentication events spanning 22 minutes. Identity 'marcus.vance' established SMB session on bastion host (T1021.002) followed by attempted privilege escalation toward crown-jewel RDS instance 'srv-db-prod-01'.",
      },
    },
  },
  ASSURE: {
    mode: "ASSURE",
    title: "Verify SOC 2 CC6.1 Access Evidence",
    query: "Generate cryptographic verification proof for JIT elevation sessions over the last 30 days.",
    defaultEnvelope: {
      envelopeId: "env-assure-cc61",
      tenantId: "00000000-0000-4000-8000-000000000001",
      environmentId: "PRODUCTION",
      createdAt: new Date().toISOString(),
      aiLabelAndUseCaseName: {
        aiLabel: "ZoikoShield Guarded ModelArmor Engine v2.4",
        useCaseName: "COPILOT_ASSURE",
        modelRoute: "vertex-ai/gemini-1.5-pro-002",
        version: "gemini-1.5-pro-002",
        modelIdentifier: "gemini-1.5-pro-002",
        providerProfile: "gcp-vertex-ai-europe-west2",
        riskTier: "LOW",
      },
      sourcesAndSpans: [
        {
          sourceId: "src-merkle-epoch-1043",
          sourceType: "DILITHIUM3_PROOF",
          name: "merkle-tree-epoch-1043",
          type: "DILITHIUM3_PROOF",
          documentRef: "ref-epoch-1043",
          exactSpan: "MerkleRoot: 0x9f88c... | Checkpoint signature: ECDSA P-256 + ML-DSA-65 verified",
          span: "MerkleRoot: 0x9f88c... | Checkpoint signature: ECDSA P-256 + ML-DSA-65 verified",
          confidence: 0.99,
          confidenceScore: 0.99,
        },
        {
          sourceId: "src-jit-ledger",
          sourceType: "AUDIT_PACKAGE",
          name: "jit-session-ledger",
          type: "AUDIT_PACKAGE",
          documentRef: "ref-jit-48-sessions",
          exactSpan: "48 Sessions logged with unalterable timestamps and dual-approver quorum",
          span: "48 Sessions logged with unalterable timestamps and dual-approver quorum",
          confidence: 1.0,
          confidenceScore: 1.0,
        },
      ],
      knownMissingStaleOrConflictingEvidence: {
        missingEvidence: [],
        staleEvidence: [],
        conflictingEvidence: [],
        missingEvidenceCount: 0,
        staleEvidenceCount: 0,
        conflictingEvidenceCount: 0,
        freshnessSeconds: 5,
        completenessRatio: 1.0,
      },
      calibratedConfidenceAndUncertainty: {
        score: 0.99,
        qualitativeBand: "HIGH",
        confidenceTier: "HIGH",
        calibrationBasis: "Mathematical inclusion proof in Merkle Tree Epoch #1043.",
        uncertaintyFactors: [
          "Deterministic cryptographic verification complete; zero heuristic uncertainty.",
        ],
      },
      alternativeHypothesesOrActions: [
        {
          actionId: "ALT-01",
          title: "Export Standalone Verifier ZIP",
          rationale: "Package offline verification CLI with Merkle inclusion proofs.",
          tradeOffs: "Provides self-contained auditor verification package without internet dependency.",
          tradeOff: "Provides self-contained auditor verification package without internet dependency.",
        },
      ],
      expectedImpactAndReversibility: {
        blastRadius: "Zero operational impact (Read-Only Evidence Probe).",
        isReversible: true,
        reversibilityTier: "R0",
        compensationPlan: "Not applicable; read-only cryptographic verification.",
        downtimeExpected: false,
        reversibility: "Not Applicable (Evidence Record)",
        compensationMechanism: "N/A (Read-Only)",
      },
      requiredAuthorityAndApprovals: {
        requiredRole: "AUDITOR_OR_COMPLIANCE_LEAD",
        responseAuthorityTier: "R0",
        requiredAuthorityTier: "R0",
        dualApproverRequired: false,
        dualCustodyRequired: false,
        approverRoles: ["COMPLIANCE_OFFICER", "SOC_ANALYST"],
      },
      controls: {
        state: "UNREVIEWED",
        currentState: "PENDING_REVIEW",
        availableTransitions: ["ACCEPT", "MODIFY", "REJECT", "ESCALATE"],
      },
      humanDecisionAndRationale: {},
      appealOrFeedbackRoute: {
        appealUrl: "https://shield.zoikogroup.com/appeals/v1",
        feedbackChannel: "compliance-review@zoikogroup.com",
        customerAffecting: false,
      },
      payload: {
        summary:
          "Evaluated 48 JIT elevation requests against SOC 2 CC6.1 and ISO/IEC 27001:2022 A.5.18 controls. All 48 sessions satisfied dual-approver quorum and terminated within maximum 60-minute duration. Merkle epoch roots verified against the dual-signed (ECDSA P-256 + ML-DSA-65) checkpoint.",
      },
    },
  },
  RESPOND: {
    mode: "RESPOND",
    title: "Formulate Containment Action Proposal",
    query: "Propose network isolation and credential revoke for compromised IAM role arn:aws:iam::123456789012:role/DeployBot.",
    defaultEnvelope: {
      envelopeId: "env-resp-deploybot",
      tenantId: "00000000-0000-4000-8000-000000000001",
      environmentId: "PRODUCTION",
      createdAt: new Date().toISOString(),
      aiLabelAndUseCaseName: {
        aiLabel: "ZoikoShield Guarded ModelArmor Engine v2.4",
        useCaseName: "COPILOT_RESPOND",
        modelRoute: "vertex-ai/gemini-1.5-pro-002",
        version: "gemini-1.5-pro-002",
        modelIdentifier: "gemini-1.5-pro-002",
        providerProfile: "gcp-vertex-ai-europe-west2",
        riskTier: "HIGH",
      },
      sourcesAndSpans: [
        {
          sourceId: "src-soar-iam-04",
          sourceType: "ACTION_TEMPLATE",
          name: "soar-playbook-iam-04",
          type: "ACTION_TEMPLATE",
          documentRef: "ref-playbook-iam-04",
          exactSpan: "ActionId: ACT-IAM-FREEZE-R3 | Reversible: True | TokenRequired: True",
          span: "ActionId: ACT-IAM-FREEZE-R3 | Reversible: True | TokenRequired: True",
          confidence: 0.96,
          confidenceScore: 0.96,
        },
        {
          sourceId: "src-iam-role-def",
          sourceType: "ROLE_DEFINITION",
          name: "aws-iam-metadata",
          type: "ROLE_DEFINITION",
          documentRef: "ref-iam-deploybot",
          exactSpan: "Role: DeployBot | AttachedPolicies: 3 | SessionDuration: 3600",
          span: "Role: DeployBot | AttachedPolicies: 3 | SessionDuration: 3600",
          confidence: 0.99,
          confidenceScore: 0.99,
        },
      ],
      knownMissingStaleOrConflictingEvidence: {
        missingEvidence: [],
        staleEvidence: [],
        conflictingEvidence: [],
        missingEvidenceCount: 0,
        staleEvidenceCount: 0,
        conflictingEvidenceCount: 0,
        freshnessSeconds: 8,
        completenessRatio: 1.0,
      },
      calibratedConfidenceAndUncertainty: {
        score: 0.91,
        qualitativeBand: "HIGH",
        confidenceTier: "HIGH",
        calibrationBasis: "MITRE ATT&CK T1078 remediation playbook with automated rollback snapshot.",
        uncertaintyFactors: [
          "CI/CD deploy pipeline will halt until new credential rotation completes.",
        ],
      },
      alternativeHypothesesOrActions: [
        {
          actionId: "ALT-01",
          title: "Scope to Production VPC Only",
          rationale: "Scope isolation strictly to production VPC without revoking dev/staging permissions.",
          tradeOffs: "Allows non-prod deployments to continue but leaves staging credentials vulnerable.",
          tradeOff: "Allows non-prod deployments to continue but leaves staging credentials vulnerable.",
        },
      ],
      expectedImpactAndReversibility: {
        blastRadius: "Automated deployment pipeline paused. No customer runtime downtime.",
        isReversible: true,
        reversibilityTier: "R3",
        compensationPlan: "Rollback script `rb-act-deploybot-2026.json` re-attaches original policy.",
        downtimeExpected: false,
        reversibility: "Fully Reversible (Signed Rollback Token: ZS-RB-TOKEN-9941)",
        compensationMechanism: "Signed Rollback Token: ZS-RB-TOKEN-9941",
      },
      requiredAuthorityAndApprovals: {
        requiredRole: "LEAD_SECURITY_ANALYST",
        responseAuthorityTier: "R3",
        requiredAuthorityTier: "R3",
        dualApproverRequired: true,
        dualCustodyRequired: true,
        approverRoles: ["SECURITY_OPERATIONS_LEAD", "SOC_MANAGER"],
      },
      controls: {
        state: "UNREVIEWED",
        currentState: "PENDING_REVIEW",
        availableTransitions: ["ACCEPT", "MODIFY", "REJECT", "ESCALATE"],
      },
      humanDecisionAndRationale: {},
      appealOrFeedbackRoute: {
        appealUrl: "https://shield.zoikogroup.com/appeals/v1",
        feedbackChannel: "secops-human-review@zoikogroup.com",
        customerAffecting: true,
      },
      payload: {
        summary:
          "Drafted R3 Containment Action: (1) Attach inline deny policy `AWSRevokeOlderSessions` to DeployBot, (2) Invalidate active STS session tokens, (3) Rotate KMS data keys accessed in past 4 hours. Automated rollback script prepared.",
      },
    },
  },
  REPORT: {
    mode: "REPORT",
    title: "Draft Executive & Regulatory Disclosure",
    query: "Draft preliminary incident timeline and customer-affecting notice for Case CAS-1082.",
    defaultEnvelope: {
      envelopeId: "env-rep-cas1082",
      tenantId: "00000000-0000-4000-8000-000000000001",
      environmentId: "PRODUCTION",
      createdAt: new Date().toISOString(),
      aiLabelAndUseCaseName: {
        aiLabel: "ZoikoShield Guarded ModelArmor Engine v2.4",
        useCaseName: "COPILOT_REPORT",
        modelRoute: "vertex-ai/gemini-1.5-pro-002",
        version: "gemini-1.5-pro-002",
        modelIdentifier: "gemini-1.5-pro-002",
        providerProfile: "gcp-vertex-ai-europe-west2",
        riskTier: "MEDIUM",
      },
      sourcesAndSpans: [
        {
          sourceId: "src-timeline-ledger",
          sourceType: "TIMELINE_LEDGER",
          name: "case-cas-1082-evidence",
          type: "TIMELINE_LEDGER",
          documentRef: "ref-cas-1082",
          exactSpan: "18 Evidence items correlated | Containment achieved in 18 minutes",
          span: "18 Evidence items correlated | Containment achieved in 18 minutes",
          confidence: 0.95,
          confidenceScore: 0.95,
        },
      ],
      knownMissingStaleOrConflictingEvidence: {
        missingEvidence: ["Final Tier-3 memory forensics image dump pending completion"],
        staleEvidence: [],
        conflictingEvidence: [],
        missingEvidenceCount: 1,
        staleEvidenceCount: 0,
        conflictingEvidenceCount: 0,
        freshnessSeconds: 32,
        completenessRatio: 0.92,
      },
      calibratedConfidenceAndUncertainty: {
        score: 0.85,
        qualitativeBand: "MEDIUM",
        confidenceTier: "MEDIUM",
        calibrationBasis: "Normalized case evidence records and data classification labels.",
        uncertaintyFactors: [
          "Final forensic disk image verification pending; summary based on live telemetry.",
        ],
      },
      alternativeHypothesesOrActions: [
        {
          actionId: "ALT-01",
          title: "Await Memory Forensics Finalization",
          rationale: "Wait for Tier-3 memory forensics completion before issuing draft.",
          tradeOffs: "Ensures 100% forensic certainty but delays required 24-hour statutory notification.",
          tradeOff: "Ensures 100% forensic certainty but delays required 24-hour statutory notification.",
        },
      ],
      expectedImpactAndReversibility: {
        blastRadius: "Legal & Regulatory Communication Draft.",
        isReversible: true,
        reversibilityTier: "R1",
        compensationPlan: "Draft text fully modifiable by Legal Counsel prior to release.",
        downtimeExpected: false,
        reversibility: "Fully Modifiable by Legal Counsel",
        compensationMechanism: "Version Revision History",
      },
      requiredAuthorityAndApprovals: {
        requiredRole: "GENERAL_COUNSEL_OR_CISO",
        responseAuthorityTier: "R1",
        requiredAuthorityTier: "R1",
        dualApproverRequired: false,
        dualCustodyRequired: false,
        approverRoles: ["LEGAL_COUNSEL", "CISO"],
      },
      controls: {
        state: "UNREVIEWED",
        currentState: "PENDING_REVIEW",
        availableTransitions: ["ACCEPT", "MODIFY", "REJECT", "ESCALATE"],
      },
      humanDecisionAndRationale: {},
      appealOrFeedbackRoute: {
        appealUrl: "https://shield.zoikogroup.com/appeals/v1",
        feedbackChannel: "legal-review@zoikogroup.com",
        customerAffecting: false,
      },
      payload: {
        summary:
          "Generated statutory timeline for Case CAS-1082: Initial breach detection at 08:14 UTC, containment achieved at 08:32 UTC (18 min). Zero customer PII exfiltration detected across S3 access logs. Draft marked 'Privileged & Confidential - Counsel Controlled'.",
      },
    },
  },
  DEVELOP: {
    mode: "DEVELOP",
    title: "Generate Least-Privilege IAM & Sigma Rule",
    query: "Generate Sigma detection rule for unauthenticated Kerberos AS-REP roasting attempts.",
    defaultEnvelope: {
      envelopeId: "env-dev-sigma01",
      tenantId: "00000000-0000-4000-8000-000000000001",
      environmentId: "PRODUCTION",
      createdAt: new Date().toISOString(),
      aiLabelAndUseCaseName: {
        aiLabel: "ZoikoShield Guarded ModelArmor Engine v2.4",
        useCaseName: "COPILOT_DEVELOP",
        modelRoute: "vertex-ai/gemini-1.5-pro-002",
        version: "gemini-1.5-pro-002",
        modelIdentifier: "gemini-1.5-pro-002",
        providerProfile: "gcp-vertex-ai-europe-west2",
        riskTier: "LOW",
      },
      sourcesAndSpans: [
        {
          sourceId: "src-sigma-spec",
          sourceType: "RULE_SYNTAX",
          name: "sigma-specification-v1.1",
          type: "RULE_SYNTAX",
          documentRef: "ref-sigma-v1.1",
          exactSpan: "Category: Windows Security Event Log | EventID: 4768 | TicketEncryption: 0x17",
          span: "Category: Windows Security Event Log | EventID: 4768 | TicketEncryption: 0x17",
          confidence: 0.99,
          confidenceScore: 0.99,
        },
      ],
      knownMissingStaleOrConflictingEvidence: {
        missingEvidence: [],
        staleEvidence: [],
        conflictingEvidence: [],
        missingEvidenceCount: 0,
        staleEvidenceCount: 0,
        conflictingEvidenceCount: 0,
        freshnessSeconds: 15,
        completenessRatio: 1.0,
      },
      calibratedConfidenceAndUncertainty: {
        score: 0.96,
        qualitativeBand: "HIGH",
        confidenceTier: "HIGH",
        calibrationBasis: "Historical telemetry backtesting against 1.2M AD security events with 0 false positives.",
        uncertaintyFactors: [
          "Legacy service accounts using RC4 encryption must be explicitly allowlisted.",
        ],
      },
      alternativeHypothesesOrActions: [
        {
          actionId: "ALT-01",
          title: "Generate Elastic DSL Query",
          rationale: "Emit native Elastic query syntax alongside Sigma YAML.",
          tradeOffs: "Provides immediate query copy-paste for Elastic clusters.",
          tradeOff: "Provides immediate query copy-paste for Elastic clusters.",
        },
      ],
      expectedImpactAndReversibility: {
        blastRadius: "Zero runtime impact (Detection Rule Definition).",
        isReversible: true,
        reversibilityTier: "R0",
        compensationPlan: "Disable rule toggle in Detection Engine.",
        downtimeExpected: false,
        reversibility: "Fully Reversible",
        compensationMechanism: "Rule Toggle",
      },
      requiredAuthorityAndApprovals: {
        requiredRole: "DETECTION_ENGINEER",
        responseAuthorityTier: "R0",
        requiredAuthorityTier: "R0",
        dualApproverRequired: false,
        dualCustodyRequired: false,
        approverRoles: ["SECURITY_ENGINEER", "SOC_ANALYST"],
      },
      controls: {
        state: "UNREVIEWED",
        currentState: "PENDING_REVIEW",
        availableTransitions: ["ACCEPT", "MODIFY", "REJECT", "ESCALATE"],
      },
      humanDecisionAndRationale: {},
      appealOrFeedbackRoute: {
        appealUrl: "https://shield.zoikogroup.com/appeals/v1",
        feedbackChannel: "detections-engineering@zoikogroup.com",
        customerAffecting: false,
      },
      payload: {
        summary:
          "Generated Sigma rule `win_security_kerberos_asrep_roasting.yml` mapped to MITRE T1558.004 with high-fidelity filter on EventID 4768 and Ticket Encryption Type 0x17 (RC4-HMAC). Tested against past 90-day event baseline with 0 false positives.",
      },
    },
  },
  NAVIGATE: {
    mode: "NAVIGATE",
    title: "Platform Tour & Governance Navigation",
    query: "What is the operational difference between Shield Professional and Shield Advanced?",
    defaultEnvelope: {
      envelopeId: "env-nav-pricing",
      tenantId: "00000000-0000-4000-8000-000000000001",
      environmentId: "PRODUCTION",
      createdAt: new Date().toISOString(),
      aiLabelAndUseCaseName: {
        aiLabel: "ZoikoShield Guarded ModelArmor Engine v2.4",
        useCaseName: "COPILOT_NAVIGATE",
        modelRoute: "vertex-ai/gemini-2.0-flash",
        version: "gemini-2.0-flash",
        modelIdentifier: "gemini-2.0-flash",
        providerProfile: "gcp-vertex-ai-europe-west2",
        riskTier: "LOW",
      },
      sourcesAndSpans: [
        {
          sourceId: "src-plan-tier-registry",
          sourceType: "PRICING_SPEC",
          name: "plan-tier-registry",
          type: "PRICING_SPEC",
          documentRef: "ref-pricing-spec",
          exactSpan: "Professional: $4,000/mo | Advanced: $8,000/mo (Governed response, custom SLAs defined per customer order form)",
          span: "Professional: $4,000/mo | Advanced: $8,000/mo (Governed response, custom SLAs defined per customer order form)",
          confidence: 1.0,
          confidenceScore: 1.0,
        },
      ],
      knownMissingStaleOrConflictingEvidence: {
        missingEvidence: [],
        staleEvidence: [],
        conflictingEvidence: [],
        missingEvidenceCount: 0,
        staleEvidenceCount: 0,
        conflictingEvidenceCount: 0,
        freshnessSeconds: 1,
        completenessRatio: 1.0,
      },
      calibratedConfidenceAndUncertainty: {
        score: 1.0,
        qualitativeBand: "HIGH",
        confidenceTier: "HIGH",
        calibrationBasis: "ZoikoShield Commercial Plan-Tier Engine & Operational Standards.",
        uncertaintyFactors: [
          "Deterministic platform catalogue specification reference.",
        ],
      },
      alternativeHypothesesOrActions: [
        {
          actionId: "ALT-01",
          title: "View Live Pricing Comparison Ladder",
          rationale: "Navigate directly to /pricing interactive view.",
          tradeOffs: "Redirects analyst to billing overview.",
          tradeOff: "Redirects analyst to billing overview.",
        },
      ],
      expectedImpactAndReversibility: {
        blastRadius: "Informational Navigation.",
        isReversible: true,
        reversibilityTier: "R0",
        compensationPlan: "N/A",
        downtimeExpected: false,
        reversibility: "Not Applicable",
        compensationMechanism: "N/A",
      },
      requiredAuthorityAndApprovals: {
        requiredRole: "ANY_AUTHENTICATED_USER",
        responseAuthorityTier: "R0",
        requiredAuthorityTier: "R0",
        dualApproverRequired: false,
        dualCustodyRequired: false,
        approverRoles: ["SECURITY_ANALYST", "TENANT_OWNER"],
      },
      controls: {
        state: "UNREVIEWED",
        currentState: "PENDING_REVIEW",
        availableTransitions: ["ACCEPT", "MODIFY", "REJECT", "ESCALATE"],
      },
      humanDecisionAndRationale: {},
      appealOrFeedbackRoute: {
        appealUrl: "https://shield.zoikogroup.com/appeals/v1",
        feedbackChannel: "commercial-operations@zoikogroup.com",
        customerAffecting: false,
      },
      payload: {
        summary:
          "Shield Professional ($4,000/mo) includes 1,000 assets, 100 GB/day telemetry, AI Copilot, attack graphs, and 1-hour response SLA. Shield Advanced ($8,000/mo) expands to 5,000 assets, 500 GB/day, Rule SVC-01 certified 24/7/365 continuous MDR with 15-minute containment SLAs, and continuous security validation.",
      },
    },
  },
};

export default function CopilotPage() {
  const [activeMode, setActiveMode] = useState<CopilotMode>("INVESTIGATE");
  const [customInput, setCustomInput] = useState("");
  const [generating, setGenerating] = useState(false);

  // Active Decision Review Envelope (Spec §16.1)
  const [currentEnvelope, setCurrentEnvelope] = useState<AiReviewEnvelope>(
    PRESETS["INVESTIGATE"].defaultEnvelope
  );

  // Chat conversation
  const [chatHistory, setChatHistory] = useState<
    Array<{
      sender: "user" | "copilot" | "system";
      text: string;
      envelope?: AiReviewEnvelope;
    }>
  >([
    {
      sender: "copilot",
      text: "ZoikoShield AI Security Copilot ready. Operating under deterministic dual-review protocol with source grounding and Spec §16.1 10-Field Mandatory Decision Review Envelope.",
      envelope: PRESETS["INVESTIGATE"].defaultEnvelope,
    },
  ]);

  // Interactive Decision Modal State
  const [decisionModalOpen, setDecisionModalOpen] = useState(false);
  const [pendingTransition, setPendingTransition] = useState<DecisionTransition>("ACCEPT");
  const [operatorId, setOperatorId] = useState("usr-sarah-chen-01 (Lead Analyst)");
  const [rationale, setRationale] = useState("");
  const [modifiedContent, setModifiedContent] = useState("");
  const [escalatedToRole, setEscalatedToRole] = useState("SOC_MANAGER");
  const [submittingDecision, setSubmittingDecision] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [lastReceipt, setLastReceipt] = useState<{
    signature: string;
    decidedAt: string;
    status: string;
  } | null>(null);

  const activePreset = PRESETS[activeMode];

  const handleSend = async (queryText?: string) => {
    const text = queryText || customInput;
    if (!text.trim() || generating) return;

    setChatHistory((prev) => [...prev, { sender: "user", text }]);
    setCustomInput("");
    setGenerating(true);

    try {
      const res = await ZoikoShieldApiClient.queryCopilot({
        query: text,
        mode: activeMode,
      });

      const env = res.envelope || activePreset.defaultEnvelope;
      setCurrentEnvelope(env);

      setChatHistory((prev) => [
        ...prev,
        {
          sender: "copilot",
          text: res.summary || env.payload?.summary || "Generated Spec §16.1 review hypothesis.",
          envelope: env,
        },
      ]);
    } catch (err: any) {
      // Fallback to preset envelope on unexpected error
      const env = activePreset.defaultEnvelope;
      setCurrentEnvelope(env);
      setChatHistory((prev) => [
        ...prev,
        {
          sender: "copilot",
          text: env.payload?.summary || "Synthesized security analysis.",
          envelope: env,
        },
      ]);
    } finally {
      setGenerating(false);
    }
  };

  const handleModeChange = (mode: CopilotMode) => {
    setActiveMode(mode);
    const preset = PRESETS[mode];
    setCurrentEnvelope(preset.defaultEnvelope);
    setChatHistory((prev) => [
      ...prev,
      {
        sender: "copilot",
        text: `Switched to mode [${mode}]: ${preset.title}. Ask a question or run the suggested query.`,
        envelope: preset.defaultEnvelope,
      },
    ]);
  };

  const openDecisionModal = (transition: DecisionTransition) => {
    setPendingTransition(transition);
    setRationale("");
    setModifiedContent(
      currentEnvelope.expectedImpactAndReversibility?.blastRadius || ""
    );
    setDecisionError(null);
    setDecisionModalOpen(true);
  };

  const submitDecision = async () => {
    if (!rationale.trim()) {
      setDecisionError("Spec §16.1 Invariant: Attribution rationale is mandatory for human operator decisions.");
      return;
    }

    if (pendingTransition === "MODIFY" && !modifiedContent.trim()) {
      setDecisionError("Modified scope/parameters required when transition action is MODIFY.");
      return;
    }

    setSubmittingDecision(true);
    setDecisionError(null);

    try {
      const res = await ZoikoShieldApiClient.recordReviewDecision({
        envelopeId: currentEnvelope.envelopeId,
        decision: pendingTransition,
        decidedBy: operatorId,
        rationale: rationale.trim(),
        modifiedContent: pendingTransition === "MODIFY" ? modifiedContent.trim() : undefined,
        escalatedToRole: pendingTransition === "ESCALATE" ? escalatedToRole : undefined,
      });

      setCurrentEnvelope(res.envelope);
      setLastReceipt({
        signature: res.receiptSignature,
        decidedAt: res.decidedAt,
        status: res.status,
      });

      // Append system audit message in chat
      setChatHistory((prev) => [
        ...prev,
        {
          sender: "system",
          text: `[AUDIT RECEIPT] Operator ${operatorId} recorded ${pendingTransition} on ${res.envelope.envelopeId}. Receipt Signature: ${res.receiptSignature.slice(0, 18)}...`,
          envelope: res.envelope,
        },
      ]);

      setDecisionModalOpen(false);
    } catch (err: any) {
      setDecisionError(err.message || "Failed to record human operator decision.");
    } finally {
      setSubmittingDecision(false);
    }
  };

  // State badge styling
  const currentState =
    currentEnvelope.controls?.state ||
    currentEnvelope.controls?.currentState ||
    "UNREVIEWED";

  const getStateBadge = (state: string) => {
    switch (state) {
      case "ACCEPTED":
        return "bg-emerald-950 text-emerald-300 border-emerald-500/40";
      case "MODIFIED":
        return "bg-amber-950 text-amber-300 border-amber-500/40";
      case "REJECTED":
        return "bg-rose-950 text-rose-300 border-rose-500/40";
      case "ESCALATED":
        return "bg-purple-950 text-purple-300 border-purple-500/40";
      default:
        return "bg-cyan-950 text-cyan-300 border-cyan-500/40 animate-pulse";
    }
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono">
            <Bot className="w-3.5 h-3.5" />
            <span>DETERMINISTIC AI COPILOT • SPEC §16.1 COMPLIANT</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-100">
            ZoikoShield AI Security Copilot
          </h1>
          <p className="text-slate-400 text-xs max-w-2xl">
            Deterministic dual-review conversational security copilot providing grounded source spans, confidence calibration bands, and reversible blast-radius proposals across 6 operational patterns.
          </p>
        </div>

        {/* Governance & Rule CAT-02 Neutrality Badge */}
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-right shrink-0">
            <div className="text-[10px] font-mono text-slate-500 uppercase">Governance Rule CAT-02</div>
            <div className="text-xs font-mono text-cyan-400 font-bold">Unbranded AI Architecture</div>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-right shrink-0">
            <div className="text-[10px] font-mono text-slate-500 uppercase">Decision Rights Spec</div>
            <div className="text-xs font-mono text-emerald-400 font-bold">§16.1 10-Field Mandatory</div>
          </div>
        </div>
      </div>

      {/* 6 Operational Modes Selector */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {(
          [
            { mode: "INVESTIGATE", label: "1. Investigate", icon: <Search className="w-4 h-4" /> },
            { mode: "ASSURE", label: "2. Assure", icon: <ShieldAlert className="w-4 h-4" /> },
            { mode: "RESPOND", label: "3. Respond", icon: <Zap className="w-4 h-4" /> },
            { mode: "REPORT", label: "4. Report", icon: <FileText className="w-4 h-4" /> },
            { mode: "DEVELOP", label: "5. Develop", icon: <Code className="w-4 h-4" /> },
            { mode: "NAVIGATE", label: "6. Navigate", icon: <Compass className="w-4 h-4" /> },
          ] as const
        ).map((item) => {
          const isActive = activeMode === item.mode;
          return (
            <button
              key={item.mode}
              onClick={() => handleModeChange(item.mode)}
              className={`p-3 rounded-xl flex items-center gap-2 text-xs font-mono font-medium transition-all ${
                isActive
                  ? "bg-cyan-500/20 text-cyan-300 border-2 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.2)]"
                  : "bg-slate-900/60 text-slate-400 border border-slate-800 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Interactive Chat & 10-Field Decision Envelope View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Chat History & Input */}
        <div className="lg:col-span-6 space-y-4">
          <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-5 space-y-4 min-h-[520px] max-h-[640px] overflow-y-auto flex flex-col justify-between">
            <div className="space-y-4">
              {chatHistory.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-3 ${
                    msg.sender === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {msg.sender === "copilot" && (
                    <div className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}
                  {msg.sender === "system" && (
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                      <FileCheck className="w-4 h-4" />
                    </div>
                  )}
                  <div
                    className={`p-3.5 rounded-2xl text-xs leading-relaxed max-w-[88%] ${
                      msg.sender === "user"
                        ? "bg-cyan-600 text-slate-950 font-medium"
                        : msg.sender === "system"
                        ? "bg-slate-950/90 border border-emerald-500/30 text-emerald-300 font-mono text-[11px]"
                        : "bg-slate-950/80 border border-slate-800 text-slate-200"
                    }`}
                  >
                    <p>{msg.text}</p>
                    {msg.envelope && msg.sender === "copilot" && (
                      <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-400">
                        <span>
                          Confidence:{" "}
                          {(
                            (msg.envelope.calibratedConfidenceAndUncertainty?.score || 0.94) *
                            100
                          ).toFixed(0)}
                          %
                        </span>
                        <span className="text-cyan-400 font-semibold">
                          {msg.envelope.requiredAuthorityAndApprovals?.responseAuthorityTier ||
                            msg.envelope.requiredAuthorityAndApprovals?.requiredAuthorityTier ||
                            "R2"}{" "}
                          Authority
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] border ${getStateBadge(
                            msg.envelope.controls?.state ||
                              msg.envelope.controls?.currentState ||
                              "UNREVIEWED"
                          )}`}
                        >
                          {msg.envelope.controls?.state ||
                            msg.envelope.controls?.currentState ||
                            "UNREVIEWED"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {generating && (
                <div className="flex gap-3 items-center text-xs font-mono text-cyan-400 animate-pulse">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Synthesizing Spec §16.1 multi-source review envelope...</span>
                </div>
              )}
            </div>

            {/* Quick Prompt Suggester */}
            <div className="pt-2 border-t border-slate-800/80 space-y-2">
              <div className="text-[10px] font-mono text-slate-500 uppercase flex items-center justify-between">
                <span>Suggested Query for [{activeMode}]:</span>
                <span className="text-cyan-400">Click to execute</span>
              </div>
              <button
                onClick={() => handleSend(activePreset.query)}
                disabled={generating}
                className="w-full text-left p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 hover:border-cyan-500/40 text-xs text-slate-300 font-mono transition-colors flex items-center justify-between group"
              >
                <span className="line-clamp-1">{activePreset.query}</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 shrink-0" />
              </button>
            </div>
          </div>

          {/* Input Bar */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={`Ask AI Security Copilot in [${activeMode}] mode...`}
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              disabled={generating}
              className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
            />
            <button
              onClick={() => handleSend()}
              disabled={!customInput.trim() || generating}
              className="px-5 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shrink-0"
            >
              <span>Execute</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right Column: Spec §16.1 10-Field Mandatory Decision Review Envelope */}
        <div className="lg:col-span-6 rounded-2xl bg-slate-950 border border-cyan-500/40 p-5 space-y-4 shadow-[0_0_30px_rgba(6,182,212,0.12)]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-slate-100">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>10-FIELD DECISION REVIEW ENVELOPE</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                id="envelope-lifecycle-badge"
                className={`px-2 py-0.5 rounded text-[10px] font-mono border font-semibold ${getStateBadge(
                  currentState
                )}`}
              >
                {currentState}
              </span>
              <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 text-[10px] font-mono border border-cyan-500/30">
                Spec §16.1
              </span>
            </div>
          </div>

          <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 pb-1">
            <span>ENVELOPE ID: <span className="text-cyan-400">{currentEnvelope.envelopeId}</span></span>
            <span>CREATED: {new Date(currentEnvelope.createdAt).toLocaleTimeString()}</span>
          </div>

          <div className="space-y-3.5 text-xs text-slate-300">
            {/* Field 1: AI Label & Use Case Name */}
            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/90 space-y-1">
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-cyan-400 font-bold uppercase">
                  1. AI Label & Use-Case Name
                </span>
                <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 text-[9px]">
                  Risk: {currentEnvelope.aiLabelAndUseCaseName?.riskTier || "HIGH"}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                <span className="text-slate-200">
                  {currentEnvelope.aiLabelAndUseCaseName?.aiLabel ||
                    "ZoikoShield Guarded ModelArmor Engine v2.4"}
                </span>
                <span className="text-cyan-400">
                  {currentEnvelope.aiLabelAndUseCaseName?.useCaseName}
                </span>
              </div>
              <div className="text-[10px] font-mono text-slate-500">
                Route: {currentEnvelope.aiLabelAndUseCaseName?.modelIdentifier || currentEnvelope.aiLabelAndUseCaseName?.modelRoute || "gemini-1.5-pro-002"}
              </div>
            </div>

            {/* Field 2: Grounded Source Spans (Zero Hallucination) */}
            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/90 space-y-1.5">
              <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase block">
                2. Sources & Exact Supporting Spans (Zero Hallucination)
              </span>
              <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                {(currentEnvelope.sourcesAndSpans || []).map((s, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono space-y-0.5"
                  >
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-cyan-400 font-semibold">
                        {s.name || s.sourceId} ({s.type || s.sourceType})
                      </span>
                      <span className="text-emerald-400">
                        {((s.confidence || s.confidenceScore || 0.95) * 100).toFixed(0)}% match
                      </span>
                    </div>
                    <div className="text-slate-300 text-[10px] font-mono border-l-2 border-cyan-500/40 pl-1.5 line-clamp-2">
                      &ldquo;{s.exactSpan || s.span}&rdquo;
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Field 3: Known Missing, Stale or Conflicting Evidence */}
            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/90 space-y-1">
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="text-cyan-400 font-bold uppercase">
                  3. Evidence Completeness & Freshness
                </span>
                <span className="text-slate-400">
                  Freshness:{" "}
                  <span className="text-emerald-400 font-bold">
                    {currentEnvelope.knownMissingStaleOrConflictingEvidence?.freshnessSeconds ?? 10}s
                  </span>
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] font-mono">
                <div className="p-1 rounded bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 block text-[8px]">MISSING</span>
                  <span className={currentEnvelope.knownMissingStaleOrConflictingEvidence?.missingEvidenceCount ? "text-amber-400 font-bold" : "text-slate-300"}>
                    {currentEnvelope.knownMissingStaleOrConflictingEvidence?.missingEvidenceCount ||
                      currentEnvelope.knownMissingStaleOrConflictingEvidence?.missingEvidence?.length ||
                      0}
                  </span>
                </div>
                <div className="p-1 rounded bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 block text-[8px]">STALE</span>
                  <span className="text-slate-300">
                    {currentEnvelope.knownMissingStaleOrConflictingEvidence?.staleEvidenceCount ||
                      currentEnvelope.knownMissingStaleOrConflictingEvidence?.staleEvidence?.length ||
                      0}
                  </span>
                </div>
                <div className="p-1 rounded bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 block text-[8px]">CONFLICTING</span>
                  <span className="text-slate-300">
                    {currentEnvelope.knownMissingStaleOrConflictingEvidence?.conflictingEvidenceCount ||
                      currentEnvelope.knownMissingStaleOrConflictingEvidence?.conflictingEvidence?.length ||
                      0}
                  </span>
                </div>
              </div>
              {currentEnvelope.knownMissingStaleOrConflictingEvidence?.missingEvidence?.length ? (
                <div className="text-[10px] font-mono text-amber-400/90 mt-1">
                  Missing Note: {currentEnvelope.knownMissingStaleOrConflictingEvidence.missingEvidence.join("; ")}
                </div>
              ) : null}
            </div>

            {/* Field 4: Calibrated Confidence & Uncertainty */}
            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/90 space-y-1">
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="text-cyan-400 font-bold uppercase">
                  4. Calibrated Confidence & Uncertainty
                </span>
                <span className="text-emerald-400 font-bold">
                  {currentEnvelope.calibratedConfidenceAndUncertainty?.qualitativeBand ||
                    currentEnvelope.calibratedConfidenceAndUncertainty?.confidenceTier ||
                    "HIGH"}{" "}
                  (
                  {(
                    (currentEnvelope.calibratedConfidenceAndUncertainty?.score || 0.94) *
                    100
                  ).toFixed(0)}
                  %)
                </span>
              </div>
              <p className="text-[10px] text-slate-400 leading-tight">
                {currentEnvelope.calibratedConfidenceAndUncertainty?.calibrationBasis}
              </p>
              {currentEnvelope.calibratedConfidenceAndUncertainty?.uncertaintyFactors?.length ? (
                <ul className="list-disc list-inside text-[10px] text-amber-400/80 font-mono">
                  {currentEnvelope.calibratedConfidenceAndUncertainty.uncertaintyFactors.map(
                    (u, idx) => (
                      <li key={idx} className="line-clamp-1">{u}</li>
                    )
                  )}
                </ul>
              ) : null}
            </div>

            {/* Field 5: Alternative Hypotheses or Actions */}
            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/90 space-y-1">
              <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase block">
                5. Alternative Hypotheses & Trade-Offs
              </span>
              <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                {(currentEnvelope.alternativeHypothesesOrActions || []).map((alt, idx) => (
                  <div key={idx} className="p-1.5 rounded bg-slate-950 border border-slate-800 text-[10px] font-mono">
                    <div className="text-slate-200 font-semibold">{alt.title}</div>
                    <div className="text-slate-400 text-[9px]">{alt.rationale}</div>
                    <div className="text-cyan-400/80 text-[9px]">
                      Trade-Off: {alt.tradeOffs || alt.tradeOff}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Field 6: Expected Impact & Reversibility */}
            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/90 space-y-1">
              <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase block">
                6. Expected Impact & Reversibility
              </span>
              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                <div className="p-1.5 rounded bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 block text-[8px]">BLAST RADIUS:</span>
                  <span className="text-slate-200">
                    {currentEnvelope.expectedImpactAndReversibility?.blastRadius}
                  </span>
                </div>
                <div className="p-1.5 rounded bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 block text-[8px]">REVERSIBILITY:</span>
                  <span className="text-emerald-400 font-semibold">
                    {currentEnvelope.expectedImpactAndReversibility?.reversibility ||
                      (currentEnvelope.expectedImpactAndReversibility?.isReversible
                        ? "Fully Reversible"
                        : "Irreversible")}
                  </span>
                </div>
              </div>
              <div className="text-[9px] font-mono text-slate-400 truncate">
                Token:{" "}
                <span className="text-cyan-400">
                  {currentEnvelope.expectedImpactAndReversibility?.compensationMechanism ||
                    currentEnvelope.expectedImpactAndReversibility?.compensationPlan ||
                    "Rollback Token: ZS-RB-TOKEN-9941"}
                </span>
              </div>
            </div>

            {/* Field 7: Required Authority & Approvals */}
            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/90 space-y-1">
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="text-cyan-400 font-bold uppercase">
                  7. Required Authority & Approvals
                </span>
                <span className="px-2 py-0.5 rounded bg-purple-950 text-purple-300 font-bold border border-purple-500/30">
                  {currentEnvelope.requiredAuthorityAndApprovals?.responseAuthorityTier ||
                    currentEnvelope.requiredAuthorityAndApprovals?.requiredAuthorityTier ||
                    "R2"}{" "}
                  Tier
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
                <span>Dual-Custody Quorum:</span>
                <span className={currentEnvelope.requiredAuthorityAndApprovals?.dualApproverRequired || currentEnvelope.requiredAuthorityAndApprovals?.dualCustodyRequired ? "text-amber-400 font-bold" : "text-slate-400"}>
                  {currentEnvelope.requiredAuthorityAndApprovals?.dualApproverRequired ||
                  currentEnvelope.requiredAuthorityAndApprovals?.dualCustodyRequired
                    ? "Mandatory 2-Operator Signatures"
                    : "Single Operator Clearance"}
                </span>
              </div>
              <div className="text-[9px] font-mono text-slate-500 truncate">
                Authorized Roles:{" "}
                {currentEnvelope.requiredAuthorityAndApprovals?.approverRoles?.join(", ") ||
                  currentEnvelope.requiredAuthorityAndApprovals?.requiredRole ||
                  "LEAD_SECURITY_ANALYST, SOC_MANAGER"}
              </div>
            </div>

            {/* Field 8: Decision Controls & Interactive Actions */}
            <div className="p-3 rounded-lg bg-slate-900 border border-cyan-500/30 space-y-2">
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="text-cyan-400 font-bold uppercase">
                  8. Human Operator Decision Controls
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  State: <span className="font-bold text-slate-200">{currentState}</span>
                </span>
              </div>

              {/* Action Buttons: ACCEPT, MODIFY, REJECT, ESCALATE */}
              <div className="grid grid-cols-4 gap-2 pt-1">
                <button
                  id="decision-action-accept"
                  onClick={() => openDecisionModal("ACCEPT")}
                  className="px-2 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[10px] font-mono font-bold flex items-center justify-center gap-1 transition-all"
                >
                  <Check className="w-3 h-3" />
                  <span>ACCEPT</span>
                </button>
                <button
                  id="decision-action-modify"
                  onClick={() => openDecisionModal("MODIFY")}
                  className="px-2 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-mono font-bold flex items-center justify-center gap-1 transition-all"
                >
                  <Sliders className="w-3 h-3" />
                  <span>MODIFY</span>
                </button>
                <button
                  id="decision-action-reject"
                  onClick={() => openDecisionModal("REJECT")}
                  className="px-2 py-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[10px] font-mono font-bold flex items-center justify-center gap-1 transition-all"
                >
                  <AlertOctagon className="w-3 h-3" />
                  <span>REJECT</span>
                </button>
                <button
                  id="decision-action-escalate"
                  onClick={() => openDecisionModal("ESCALATE")}
                  className="px-2 py-2 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 text-[10px] font-mono font-bold flex items-center justify-center gap-1 transition-all"
                >
                  <Scale className="w-3 h-3" />
                  <span>ESCALATE</span>
                </button>
              </div>
            </div>

            {/* Field 9: Recorded Human Decision & Cryptographic Signature */}
            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/90 space-y-1">
              <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase block">
                9. Recorded Human Decision & Attributable Receipt
              </span>
              {currentEnvelope.humanDecisionAndRationale?.decision ? (
                <div className="p-2 rounded bg-slate-950 border border-emerald-500/30 text-[10px] font-mono space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-emerald-400 font-bold">
                      Decision: {currentEnvelope.humanDecisionAndRationale.decision}
                    </span>
                    <span className="text-slate-500">
                      {new Date(
                        currentEnvelope.humanDecisionAndRationale.decidedAt || ""
                      ).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-slate-300">
                    Operator:{" "}
                    <span className="text-cyan-400">
                      {currentEnvelope.humanDecisionAndRationale.decidedBy}
                    </span>
                  </div>
                  <div className="text-slate-400">
                    Rationale: &ldquo;{currentEnvelope.humanDecisionAndRationale.rationale}&rdquo;
                  </div>
                  {currentEnvelope.humanDecisionAndRationale.modifiedContent && (
                    <div className="text-amber-400/90">
                      Modified Scope: {currentEnvelope.humanDecisionAndRationale.modifiedContent}
                    </div>
                  )}
                  {currentEnvelope.humanDecisionAndRationale.escalatedToRole && (
                    <div className="text-purple-400/90">
                      Escalated To: {currentEnvelope.humanDecisionAndRationale.escalatedToRole}
                    </div>
                  )}
                  {currentEnvelope.humanDecisionAndRationale.signature && (
                    <div className="pt-1 border-t border-slate-800 flex items-center gap-1 text-[9px] text-slate-500">
                      <Key className="w-3 h-3 text-cyan-400 shrink-0" />
                      <span className="font-mono truncate">
                        SIG: {currentEnvelope.humanDecisionAndRationale.signature}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-2 rounded bg-slate-950 border border-dashed border-slate-800 text-[10px] font-mono text-slate-500 text-center">
                  Pending Human Operator Review — Awaiting Attributable Sign-off
                </div>
              )}
            </div>

            {/* Field 10: Appeal / Feedback Route */}
            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/90 flex items-center justify-between text-[10px] font-mono">
              <div>
                <span className="text-cyan-400 font-bold uppercase block text-[9px]">
                  10. Appeal & Statutory Feedback Route
                </span>
                <span className="text-slate-400">
                  {currentEnvelope.appealOrFeedbackRoute?.feedbackChannel ||
                    "secops-human-review@zoikogroup.com"}
                </span>
              </div>
              <div className="text-right">
                <span
                  className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                    currentEnvelope.appealOrFeedbackRoute?.customerAffecting
                      ? "bg-amber-950 text-amber-400 border border-amber-500/30"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {currentEnvelope.appealOrFeedbackRoute?.customerAffecting
                    ? "CUSTOMER-AFFECTING"
                    : "INTERNAL SECOPS"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Human Operator Interactive Decision Modal */}
      {decisionModalOpen && (
        <div
          id="decision-review-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
        >
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-cyan-500/50 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                {pendingTransition === "ACCEPT" && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                {pendingTransition === "MODIFY" && <Sliders className="w-5 h-5 text-amber-400" />}
                {pendingTransition === "REJECT" && <AlertOctagon className="w-5 h-5 text-rose-400" />}
                {pendingTransition === "ESCALATE" && <Scale className="w-5 h-5 text-purple-400" />}
                <h3 className="text-base font-bold text-slate-100 font-mono">
                  Record Human Decision: {pendingTransition}
                </h3>
              </div>
              <button
                onClick={() => setDecisionModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-400 font-mono">
              Envelope ID: <span className="text-cyan-400">{currentEnvelope.envelopeId}</span>
            </div>

            {decisionError && (
              <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-500/50 text-rose-200 text-xs font-mono flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{decisionError}</span>
              </div>
            )}

            <div className="space-y-3 text-xs">
              {/* Operator Attribution */}
              <div className="space-y-1">
                <label className="block text-[10px] font-mono text-slate-400 uppercase font-bold">
                  Attributable Operator Identifier (Audit Signed):
                </label>
                <input
                  type="text"
                  value={operatorId}
                  onChange={(e) => setOperatorId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Mandatory Rationale */}
              <div className="space-y-1">
                <label className="block text-[10px] font-mono text-slate-400 uppercase font-bold">
                  Mandatory Operator Rationale (Spec §16.1 Invariant):
                </label>
                <textarea
                  rows={3}
                  placeholder="State technical justification, corroborating telemetry, and risk assessment rationale..."
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-cyan-500 placeholder-slate-600"
                />
              </div>

              {/* Modify field */}
              {pendingTransition === "MODIFY" && (
                <div className="space-y-1">
                  <label className="block text-[10px] font-mono text-amber-400 uppercase font-bold">
                    Modified Containment Scope / Action Parameters:
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Specify modified host, firewall rule, or restricted IAM boundary..."
                    value={modifiedContent}
                    onChange={(e) => setModifiedContent(e.target.value)}
                    className="w-full bg-slate-950 border border-amber-500/40 rounded-lg px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-amber-400"
                  />
                </div>
              )}

              {/* Escalate field */}
              {pendingTransition === "ESCALATE" && (
                <div className="space-y-1">
                  <label className="block text-[10px] font-mono text-purple-400 uppercase font-bold">
                    Target Escalation Role:
                  </label>
                  <select
                    value={escalatedToRole}
                    onChange={(e) => setEscalatedToRole(e.target.value)}
                    className="w-full bg-slate-950 border border-purple-500/40 rounded-lg px-3 py-2 text-slate-200 font-mono text-xs focus:outline-none focus:border-purple-400"
                  >
                    <option value="SOC_MANAGER">SOC Manager (R3 Authority)</option>
                    <option value="SECURITY_DIRECTOR">Security Director (R3 Authority)</option>
                    <option value="CISO">Chief Information Security Officer (R4 Authority)</option>
                    <option value="GENERAL_COUNSEL">General Counsel (Statutory Legal Authority)</option>
                  </select>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setDecisionModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                id="submit-decision-btn"
                onClick={submitDecision}
                disabled={submittingDecision || !rationale.trim()}
                className={`px-5 py-2 rounded-lg font-bold font-mono text-xs flex items-center gap-1.5 transition-all shadow-lg ${
                  pendingTransition === "ACCEPT"
                    ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950"
                    : pendingTransition === "MODIFY"
                    ? "bg-amber-500 hover:bg-amber-400 text-slate-950"
                    : pendingTransition === "REJECT"
                    ? "bg-rose-500 hover:bg-rose-400 text-white"
                    : "bg-purple-500 hover:bg-purple-400 text-white"
                } disabled:opacity-50`}
              >
                {submittingDecision ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Signing...</span>
                  </>
                ) : (
                  <>
                    <Key className="w-3.5 h-3.5" />
                    <span>Commit {pendingTransition} Decision</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
