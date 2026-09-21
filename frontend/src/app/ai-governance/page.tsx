"use client";

import React, { useState } from "react";
import { useDemoState } from "@/lib/demo-state";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { Modal } from "@/components/ui/Modal";
import {
  AiIncident,
  AiIncidentSeverity,
  AiIncidentState,
  AiIncidentTrigger,
  AiModelProfile,
  AiLifecycleState,
  EuAiActRiskTier,
  NistAiRmfFunction,
  AiReviewEnvelope,
  DecisionTransition,
} from "@/lib/types";
import {
  ShieldAlert,
  AlertOctagon,
  Sparkles,
  Layers,
  CheckCircle2,
  RefreshCw,
  Zap,
  Activity,
  ArrowRight,
  TrendingDown,
  Server,
  FileCheck2,
  Flame,
  AlertTriangle,
  Lock,
  Cpu,
  ShieldX,
  Boxes,
  PlusCircle,
  ShieldCheck,
  Trash2,
  Sliders,
  ExternalLink,
} from "lucide-react";
import {
  DegradedState,
  RecoveryState,
  LoadingState,
  StaleState,
  UnavailableState,
} from "@/components/states/mandatory-ui-states";

interface AiUseCaseEntry {
  key: string;
  name: string;
  riskTier: "AR-1" | "AR-2" | "AR-3";
  euRiskTier: EuAiActRiskTier;
  nistFunctions: NistAiRmfFunction[];
  humanOversightPolicy: "MANDATORY_DUAL_CUSTODY" | "MANDATORY_HUMAN_IN_THE_LOOP" | "NOT_MANDATORY_TIER2" | "SANDBOX_ISOLATED";
  allowedModelFamilies: string[];
  pinnedModelVersion: string;
  fallbackEngine: string;
  minGroundingScore: number;
  description: string;
  governanceStatus: "CERTIFIED_ACTIVE" | "PENDING_CONFORMITY" | "RESTRICTED";
}

const DEFAULT_USE_CASES: AiUseCaseEntry[] = [
  {
    key: "USE_CASE_ALERT_TRIAGE_SUMMARY",
    name: "Automated OCSF Alert Correlation & Executive Summary",
    riskTier: "AR-1",
    euRiskTier: "LIMITED_RISK",
    nistFunctions: ["GOVERN", "MAP", "MEASURE"],
    humanOversightPolicy: "NOT_MANDATORY_TIER2",
    allowedModelFamilies: ["Gemini (gemini-1.5-flash-002 [derived])", "Claude (claude-3-5-sonnet)"],
    pinnedModelVersion: "gemini-1.5-flash-002 [derived]",
    fallbackEngine: "Rule-Based Case Summary Extractor",
    minGroundingScore: 0.85,
    description: "Synthesizes multi-source telemetry into plain-language case narrative and threat assessment.",
    governanceStatus: "CERTIFIED_ACTIVE",
  },
  {
    key: "USE_CASE_THREAT_HUNTING_COPILOT",
    name: "Autonomous Multi-Hop Attack Path Discovery & MITRE ATT&CK Mapping",
    riskTier: "AR-2",
    euRiskTier: "HIGH_RISK",
    nistFunctions: ["GOVERN", "MAP", "MEASURE", "MANAGE"],
    humanOversightPolicy: "MANDATORY_DUAL_CUSTODY",
    allowedModelFamilies: ["Gemini (gemini-1.5-pro-002 [derived])", "GPT-4o (Azure)"],
    pinnedModelVersion: "gemini-1.5-pro-002 [derived]",
    fallbackEngine: "Keyword Query Expansion Engine",
    minGroundingScore: 0.88,
    description: "Iteratively traverses evidence graph to find shortest path to crown jewel assets with blast radius calculations.",
    governanceStatus: "CERTIFIED_ACTIVE",
  },
  {
    key: "USE_CASE_AUTONOMOUS_CONTAINMENT",
    name: "SOAR Playbook Containment Proposal Generation",
    riskTier: "AR-3",
    euRiskTier: "HIGH_RISK",
    nistFunctions: ["GOVERN", "MEASURE", "MANAGE"],
    humanOversightPolicy: "MANDATORY_DUAL_CUSTODY",
    allowedModelFamilies: ["Gemini (gemini-1.5-pro-002 [derived])", "Claude (claude-3-5-sonnet)"],
    pinnedModelVersion: "gemini-1.5-pro-002 [derived]",
    fallbackEngine: "Tier-1 Deterministic Playbook Fallback",
    minGroundingScore: 0.90,
    description: "Generates Cedar authorization containment proposals with single-use cryptographic rollback tokens.",
    governanceStatus: "CERTIFIED_ACTIVE",
  },
  {
    key: "USE_CASE_EVIDENCE_SYNTHESIS",
    name: "Immutable Evidence Ledger Rationale Extraction & Merkle Leaf Formatting",
    riskTier: "AR-1",
    euRiskTier: "LIMITED_RISK",
    nistFunctions: ["GOVERN", "MEASURE"],
    humanOversightPolicy: "MANDATORY_HUMAN_IN_THE_LOOP",
    allowedModelFamilies: ["Gemini (gemini-1.5-flash-002 [derived])", "Claude (claude-3-5-sonnet)"],
    pinnedModelVersion: "gemini-1.5-flash-002 [derived]",
    fallbackEngine: "Deterministic Rule Lookup & Signature Parser",
    minGroundingScore: 0.85,
    description: "Extracts structured evidence items and human decision rationale for epoch Merkle anchoring.",
    governanceStatus: "CERTIFIED_ACTIVE",
  },
  {
    key: "USE_CASE_RED_TEAM_REPLAY",
    name: "Autonomous Adversarial Attack Scenario Simulation & Defense Stress Testing",
    riskTier: "AR-2",
    euRiskTier: "HIGH_RISK",
    nistFunctions: ["MAP", "MEASURE", "MANAGE"],
    humanOversightPolicy: "SANDBOX_ISOLATED",
    allowedModelFamilies: ["Gemini (gemini-1.5-pro-002 [derived])", "Claude (claude-3-5-sonnet)", "Mistral Large"],
    pinnedModelVersion: "gemini-1.5-pro-002 [derived]",
    fallbackEngine: "Timeline-Based RCA Template Builder",
    minGroundingScore: 0.90,
    description: "Executes non-destructive red team simulations to probe defense guardrails against prompt injection and privilege escalation.",
    governanceStatus: "CERTIFIED_ACTIVE",
  },
];

const INITIAL_REVIEW_ENVELOPES: AiReviewEnvelope[] = [
  {
    envelopeId: "env-soc2-cc6.1-eval-01",
    tenantId: "00000000-0000-4000-8000-000000000001",
    environmentId: "PRODUCTION-US-EAST",
    createdAt: "2026-09-02T08:10:00.000Z",
    aiLabelAndUseCaseName: {
      aiLabel: "gemini-1.5-pro-002 [derived]",
      useCaseName: "USE_CASE_EVIDENCE_SYNTHESIS",
      modelRoute: "vertex-ai/claude-3-5-sonnet",
      version: "2026-08-preview",
    },
    sourcesAndSpans: [
      {
        sourceId: "EV-001",
        sourceType: "OCSF_AUTH_LOG",
        version: 1,
        exactSpan: "WebAuthn hardware FIDO2 step-up verified for usr-sarah-chen-01 at 08:00:12 UTC",
        confidence: 0.99,
      },
      {
        sourceId: "EV-002",
        sourceType: "MERKLE_PROOF_LEAF",
        version: 1,
        exactSpan: "Dilithium3 post-quantum signature verified under Epoch #1043",
        confidence: 0.995,
      },
    ],
    knownMissingStaleOrConflictingEvidence: {
      missingEvidence: [],
      staleEvidence: [],
      conflictingEvidence: [],
    },
    calibratedConfidenceAndUncertainty: {
      score: 0.985,
      qualitativeBand: "HIGH",
      calibrationBasis: "Domain: COMPLIANCE. Zero hallucinated tokens, dual-witness signed.",
      uncertaintyFactors: [],
    },
    alternativeHypothesesOrActions: [
      {
        title: "Manual Control Attestation",
        rationale: "Operator manually signs control without automated Merkle proof.",
        tradeOffs: "Requires auditor manual sampling; higher compliance overhead.",
      },
    ],
    expectedImpactAndReversibility: {
      blastRadius: "CONTROL_SCOPE_SOC2_CC6.1",
      isReversible: true,
      reversibilityTier: "R1",
      compensationPlan: "Revoke control pass verdict and trigger reassessment.",
    },
    requiredAuthorityAndApprovals: {
      requiredRole: "AUDITOR",
      responseAuthorityTier: "R1",
      dualApproverRequired: false,
    },
    controls: {
      availableTransitions: ["ACCEPT", "MODIFY", "REJECT", "ESCALATE"],
      state: "UNREVIEWED",
    },
    humanDecisionAndRationale: {},
    appealOrFeedbackRoute: {
      appealUrl: "https://shield.zoiko.internal/appeals/env-soc2-cc6.1-eval-01",
      feedbackChannel: "secops-ai-governance",
      customerAffecting: false,
    },
    payload: {
      controlId: "SOC2-CC6.1",
      verdict: "PASS",
      evidenceCount: 2,
    },
  },
  {
    envelopeId: "env-incident-contain-9021",
    tenantId: "00000000-0000-4000-8000-000000000001",
    environmentId: "PRODUCTION-US-EAST",
    createdAt: "2026-09-02T08:30:00.000Z",
    aiLabelAndUseCaseName: {
      aiLabel: "gemini-1.5-pro-002 [derived]",
      useCaseName: "USE_CASE_AUTONOMOUS_CONTAINMENT",
      modelRoute: "vertex-ai/gemini-1.5-pro",
      version: "2026-08-preview",
    },
    sourcesAndSpans: [
      {
        sourceId: "EV-003",
        sourceType: "EDR_TELEMETRY",
        version: 1,
        exactSpan: "Unsigned beaconing process svchost.exe PID 4128 connecting to 198.51.100.99:443",
        confidence: 0.94,
      },
    ],
    knownMissingStaleOrConflictingEvidence: {
      missingEvidence: ["Memory dump analysis in progress"],
      staleEvidence: [],
      conflictingEvidence: [],
    },
    calibratedConfidenceAndUncertainty: {
      score: 0.92,
      qualitativeBand: "HIGH",
      calibrationBasis: "Domain: DETECTION. Precision >= 0.90 target met.",
      uncertaintyFactors: ["Host may run secondary redundant service on same subnet."],
    },
    alternativeHypothesesOrActions: [
      {
        title: "Network Egress Rate-Limit Only",
        rationale: "Throttle host network bandwidth instead of full endpoint isolation.",
        tradeOffs: "Allows potential lateral movement; prevents service outage.",
      },
    ],
    expectedImpactAndReversibility: {
      blastRadius: "HOST: ec2-prod-app-04 (1 active user session)",
      isReversible: true,
      reversibilityTier: "R2",
      compensationPlan: "Re-enable NIC via CrowdStrike/SentinelOne API with token rollback-9021.",
    },
    requiredAuthorityAndApprovals: {
      requiredRole: "SECURITY_ANALYST",
      responseAuthorityTier: "R2",
      dualApproverRequired: false,
    },
    controls: {
      availableTransitions: ["ACCEPT", "MODIFY", "REJECT", "ESCALATE"],
      state: "UNREVIEWED",
    },
    humanDecisionAndRationale: {},
    appealOrFeedbackRoute: {
      appealUrl: "https://shield.zoiko.internal/appeals/env-incident-contain-9021",
      feedbackChannel: "incident-triage-leads",
      customerAffecting: true,
    },
    payload: {
      targetHost: "ec2-prod-app-04",
      action: "ISOLATE_EDR_HOST",
      proposedBy: "AI Investigation Agent",
    },
  },
];

export default function AiGovernancePage() {
  const [state, , isHydrated] = useDemoState();
  const [activeTab, setActiveTab] = useState<string>("incidents");
  const [isDeclaring, setIsDeclaring] = useState<boolean>(false);
  const [isRcaModalOpen, setIsRcaModalOpen] = useState<boolean>(false);
  const [activeRca, setActiveRca] = useState<{
    incident: AiIncident;
    rcaSummary: string;
    fiveWhys: string[];
    rootCauseClass: string;
    recommendedFixes: string[];
  } | null>(null);

  // Domain Mode (§17 Domain-Differentiated AI Governance)
  const [domainMode, setDomainMode] = useState<"COMPLIANCE" | "DETECTION" | "GENERAL">("COMPLIANCE");

  // Envelopes State (§16.1 10-Field Mandatory Review Envelope)
  const [envelopes, setEnvelopes] = useState<AiReviewEnvelope[]>(INITIAL_REVIEW_ENVELOPES);
  const [selectedEnvelope, setSelectedEnvelope] = useState<AiReviewEnvelope | null>(INITIAL_REVIEW_ENVELOPES[0]);
  const [envelopeActionMsg, setEnvelopeActionMsg] = useState<string | null>(null);

  // Grounding Gate Studio State (§18)
  const [gateHypothesis, setGateHypothesis] = useState(
    "Adversary compromised analyst credentials (usr-analyst-lead-01) from unauthorized IP 198.51.100.99 and executed lateral SMB movement to srv-db-prod-01."
  );
  const [gateEvidenceSpans, setGateEvidenceSpans] = useState(
    "EV-001: Authentication event for usr-analyst-lead-01 observed from non-corporate IP 198.51.100.99 at 10:42:15 UTC.\nEV-002: Lateral SMB connection established from jump-host ec2-jump-01 to srv-db-prod-01 over port 445.\nEV-003: Merkle inclusion proof verified in Epoch #1043 with Dual PQC signature."
  );
  const [gateThreshold, setGateThreshold] = useState<number>(0.95);
  const [isEvaluatingGate, setIsEvaluatingGate] = useState<boolean>(false);
  const [gateResult, setGateResult] = useState<{
    groundingScore: number;
    decision: "PERMITTED" | "BLOCKED_HALLUCINATION_DETECTED";
    citationCoveragePct: number;
    supportedTokens: number;
    totalTokens: number;
    hallucinatedSpans: string[];
    verifiedCitations: string[];
  } | null>(null);

  const handleDomainChange = (mode: "COMPLIANCE" | "DETECTION" | "GENERAL") => {
    setDomainMode(mode);
    if (mode === "COMPLIANCE") setGateThreshold(0.95);
    else if (mode === "DETECTION") setGateThreshold(0.85);
    else setGateThreshold(0.75);
  };

  const handleEvaluateGrounding = () => {
    setIsEvaluatingGate(true);
    setTimeout(() => {
      const hypTokens = gateHypothesis.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
      const evTokens = new Set(gateEvidenceSpans.toLowerCase().split(/\W+/).filter((t) => t.length > 2));

      let matched = 0;
      const ungrounded: string[] = [];

      hypTokens.forEach((token) => {
        if (evTokens.has(token)) {
          matched++;
        } else if (!["and", "the", "for", "from", "with", "this", "that", "was", "has", "are", "over"].includes(token)) {
          if (!ungrounded.includes(token) && ungrounded.length < 5) {
            ungrounded.push(token);
          }
        }
      });

      const score = hypTokens.length > 0 ? Number((matched / hypTokens.length).toFixed(3)) : 1.0;
      const coverage = Math.min(100, Math.round(score * 110));
      const decision = score >= gateThreshold ? "PERMITTED" : "BLOCKED_HALLUCINATION_DETECTED";

      setGateResult({
        groundingScore: score,
        decision,
        citationCoveragePct: coverage,
        supportedTokens: matched,
        totalTokens: hypTokens.length,
        hallucinatedSpans: ungrounded,
        verifiedCitations: ["EV-001 (SHA-256 Verified)", "EV-002 (OCSF SMB Network)", "EV-003 (PQC-BFT Epoch #1043)"],
      });
      setIsEvaluatingGate(false);
    }, 400);
  };

  const handleEnvelopeTransition = (envId: string, transition: DecisionTransition, notes: string = "Verified by operator") => {
    setEnvelopes((prev) =>
      prev.map((e) =>
        e.envelopeId === envId
          ? {
              ...e,
              controls: {
                ...e.controls,
                state: transition === "ACCEPT" ? "ACCEPTED" : transition === "MODIFY" ? "MODIFIED" : transition === "REJECT" ? "REJECTED" : "ESCALATED",
              },
              humanDecisionAndRationale: {
                decidedBy: state.session.fullName,
                decision: transition,
                rationale: notes,
                decidedAt: new Date().toISOString(),
              },
            }
          : e
      )
    );
    if (selectedEnvelope && selectedEnvelope.envelopeId === envId) {
      setSelectedEnvelope((prev) =>
        prev
          ? {
              ...prev,
              controls: {
                ...prev.controls,
                state: transition === "ACCEPT" ? "ACCEPTED" : transition === "MODIFY" ? "MODIFIED" : transition === "REJECT" ? "REJECTED" : "ESCALATED",
              },
              humanDecisionAndRationale: {
                decidedBy: state.session.fullName,
                decision: transition,
                rationale: notes,
                decidedAt: new Date().toISOString(),
              },
            }
          : null
      );
    }
    setEnvelopeActionMsg(`✅ Envelope ${envId} transitioned to ${transition}`);
    setTimeout(() => setEnvelopeActionMsg(null), 3500);
  };

  // Declare Incident Form State
  const [newTitle, setNewTitle] = useState("");
  const [newSeverity, setNewSeverity] = useState<AiIncidentSeverity>("SEV1_CRITICAL");
  const [newTrigger, setNewTrigger] = useState<AiIncidentTrigger>("PROMPT_INJECTION");
  const [newModel, setNewModel] = useState("gemini-1.5-pro");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Model Inventory State & Filters
  const [isRegisteringModel, setIsRegisteringModel] = useState<boolean>(false);
  const [inventorySearch, setInventorySearch] = useState<string>("");
  const [filterLifecycle, setFilterLifecycle] = useState<string>("ALL");
  const [filterRisk, setFilterRisk] = useState<string>("ALL");

  // Register Model Form State
  const [formModelId, setFormModelId] = useState("");
  const [formProvider, setFormProvider] = useState<string>("Google");
  const [formModelFamily, setFormModelFamily] = useState("Gemini");
  const [formVersion, setFormVersion] = useState("1.5-pro-002");
  const [formEuRisk, setFormEuRisk] = useState<EuAiActRiskTier>("LIMITED_RISK");
  const [formNistFunctions, setFormNistFunctions] = useState<NistAiRmfFunction[]>([
    "GOVERN",
    "MAP",
    "MEASURE",
  ]);
  const [formPurpose, setFormPurpose] = useState("");
  const [formUseCases, setFormUseCases] = useState("RESPONSE_RECOMMENDATION, INVESTIGATION_HYPOTHESIS");
  const [formFallbackEngine, setFormFallbackEngine] = useState("Tier-1 Deterministic RCA Rule Engine");
  const [formHhiWeight, setFormHhiWeight] = useState<number>(0.2);
  const [formHumanOversight, setFormHumanOversight] = useState<boolean>(true);
  const [formLifecycleState, setFormLifecycleState] = useState<AiLifecycleState>("PROPOSED");

  if (!isHydrated) return null;

  const incidents = state.aiIncidents || [];
  const models = state.aiModels || [];
  const modelDrifts = state.modelDriftReports || [];
  const supplyChain = state.aiSupplyChain || {
    hhiIndex: 4200,
    concentrationLevel: "MODERATE",
    primaryProvider: "Google Cloud Vertex AI",
    providerShares: { "Google Cloud Vertex AI (Gemini)": 60, "Anthropic (Claude)": 30, "Self-Hosted": 10 },
    allTier1FallbackReady: true,
  };
  const complianceDrift = state.complianceDrift || {
    tenantId: state.tenant.id,
    status: "COMPLIANT",
    score: 98.4,
    lastAssessedAt: new Date().toISOString(),
    slaAlarms: [],
  };

  const handleDeclareIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setActionLoadingId("declare");
    try {
      await ZoikoShieldApiClient.declareAiIncident({
        tenantId: state.tenant.id,
        title: newTitle,
        severity: newSeverity,
        trigger: newTrigger,
        affectedModel: newModel,
        declaredBy: state.session.fullName,
      });
      setIsDeclaring(false);
      setNewTitle("");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleContain = async (incidentId: string) => {
    setActionLoadingId(incidentId);
    try {
      await ZoikoShieldApiClient.containAiIncident(incidentId);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleFallback = async (incidentId: string) => {
    setActionLoadingId(incidentId);
    try {
      await ZoikoShieldApiClient.activateAiFallback(incidentId);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRca = async (incidentId: string) => {
    setActionLoadingId(incidentId);
    try {
      const rcaResult = await ZoikoShieldApiClient.analyzeAiIncidentRca(incidentId);
      setActiveRca(rcaResult);
      setIsRcaModalOpen(true);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleResolve = async (incidentId: string) => {
    setActionLoadingId(incidentId);
    try {
      await ZoikoShieldApiClient.resolveAiIncident(
        incidentId,
        "Model Armor pre-filter rule deployed and inference test suite confirmed zero hallucination drift."
      );
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleClose = async (incidentId: string) => {
    setActionLoadingId(incidentId);
    try {
      await ZoikoShieldApiClient.closeAiIncident(incidentId);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRemediateAlarm = async (alarmId: string) => {
    setActionLoadingId(alarmId);
    try {
      await ZoikoShieldApiClient.remediateComplianceDrift(alarmId);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRegisterModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formModelId.trim()) return;

    setActionLoadingId("register-model");
    try {
      await ZoikoShieldApiClient.registerAiModel({
        modelId: formModelId.trim().toLowerCase().replace(/\s+/g, "-"),
        provider: formProvider,
        modelFamily: formModelFamily,
        version: formVersion,
        euAiActClassification: formEuRisk,
        nistRmfAlignment: formNistFunctions,
        purpose: formPurpose || "Automated telemetry and inference processing.",
        primaryUseCaseKeys: formUseCases
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
        deterministicFallbackEngine: formFallbackEngine,
        hhiWeight: formHhiWeight,
        humanOversightRequired: formHumanOversight,
        lifecycleState: formLifecycleState,
      });
      setIsRegisteringModel(false);
      setFormModelId("");
      setFormPurpose("");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleUpdateModelLifecycle = async (
    modelId: string,
    lifecycleState: AiLifecycleState
  ) => {
    setActionLoadingId(`lifecycle-${modelId}`);
    try {
      await ZoikoShieldApiClient.updateAiModel(modelId, { lifecycleState });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDecommissionModel = async (modelId: string) => {
    setActionLoadingId(`delete-${modelId}`);
    try {
      await ZoikoShieldApiClient.deleteAiModel(modelId);
    } finally {
      setActionLoadingId(null);
    }
  };

  const toggleNistFunction = (fn: NistAiRmfFunction) => {
    if (formNistFunctions.includes(fn)) {
      setFormNistFunctions(formNistFunctions.filter((f) => f !== fn));
    } else {
      setFormNistFunctions([...formNistFunctions, fn]);
    }
  };

  const getStateBadge = (st: AiIncidentState) => {
    switch (st) {
      case "DECLARED":
        return <Badge variant="critical">DECLARED</Badge>;
      case "CONTAINED_KILL_SWITCH":
        return <Badge variant="high">KILL-SWITCH ENGAGED</Badge>;
      case "FALLBACK_ACTIVE":
        return <Badge variant="medium">FALLBACK ACTIVE</Badge>;
      case "ROOT_CAUSE_ANALYZED":
        return <Badge variant="ai">RCA ANALYZED</Badge>;
      case "RESOLVED":
        return <Badge variant="pass">RESOLVED</Badge>;
      case "CLOSED":
        return <Badge variant="neutral">CLOSED</Badge>;
      default:
        return <Badge variant="neutral">{st}</Badge>;
    }
  };

  const getLifecycleBadge = (lifecycle?: AiLifecycleState) => {
    switch (lifecycle) {
      case "APPROVED_FOR_PRODUCTION":
        return <Badge variant="pass">APPROVED FOR PROD</Badge>;
      case "EVALUATING":
        return <Badge variant="ai">EVALUATING</Badge>;
      case "PROPOSED":
        return <Badge variant="medium">PROPOSED</Badge>;
      case "DECOMMISSIONED":
        return <Badge variant="neutral">DECOMMISSIONED</Badge>;
      default:
        return <Badge variant="neutral">{lifecycle || "ACTIVE"}</Badge>;
    }
  };

  const getRiskTierBadge = (tier: EuAiActRiskTier) => {
    switch (tier) {
      case "UNACCEPTABLE_RISK":
        return <Badge variant="critical">UNACCEPTABLE RISK</Badge>;
      case "HIGH_RISK":
        return <Badge variant="high">HIGH RISK</Badge>;
      case "LIMITED_RISK":
        return <Badge variant="medium">LIMITED RISK</Badge>;
      case "MINIMAL_RISK":
        return <Badge variant="pass">MINIMAL RISK</Badge>;
      default:
        return <Badge variant="neutral">{tier}</Badge>;
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-[#121422] via-[#10141f] to-[#1a1128] border border-cyan-500/30 shadow-[0_0_35px_rgba(6,182,212,0.12)] flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-xs font-mono font-bold text-cyan-400 tracking-wider uppercase">
              GOVERNANCE & SAFETY COCKPIT (§21, §23, §24, §55)
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight flex items-center gap-3">
            AI Safety, Incident Lifecycle & Drift Operations
          </h1>
          <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
            Deterministic circuit breakers, Emergency Kill-Switch controls, Model Inventory Registry (NIST/EU AI Act), PSI drift monitoring, and Multi-Vendor Supply Chain HHI governance.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="secondary" size="md" onClick={() => setIsRegisteringModel(true)}>
            <PlusCircle className="w-4 h-4 text-cyan-400" />
            <span>Register AI Model</span>
          </Button>
          <Button variant="cyan" size="md" onClick={() => setIsDeclaring(true)}>
            <Flame className="w-4 h-4 text-rose-400" />
            <span>Declare AI Incident</span>
          </Button>
        </div>
      </div>

      {/* Non-Destructive Invariant Alert Banner */}
      <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center gap-3 text-xs font-mono text-slate-300">
        <Lock className="w-4 h-4 text-cyan-400 shrink-0" />
        <div>
          <span className="font-bold text-cyan-300">ERB-01 Non-Destructive Guardrail:</span> All emergency kill-switch containment and Tier-1 fallback routing actions execute in verifiable <span className="text-violet-300 font-semibold">Simulation Sandbox Mode</span>.
        </div>
      </div>

      {/* Top Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>ACTIVE INCIDENTS</span>
            <AlertOctagon className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 font-mono">
            {incidents.filter((i) => i.state !== "CLOSED").length}
          </div>
          <div className="text-[11px] text-rose-400 font-mono">
            {incidents.filter((i) => i.killSwitchEngaged).length} Kill-Switch active
          </div>
        </Card>

        <Card className="space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>AI SYSTEM INVENTORY</span>
            <Boxes className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 font-mono">
            {models.filter((m) => m.lifecycleState !== "DECOMMISSIONED").length}
          </div>
          <div className="text-[11px] text-emerald-400 font-mono">
            {models.filter((m) => m.lifecycleState === "APPROVED_FOR_PRODUCTION").length} Approved for Prod
          </div>
        </Card>

        <Card className="space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>MODEL DRIFT (PSI)</span>
            <Activity className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 font-mono">
            {modelDrifts.filter((d) => d.status !== "STABLE").length > 0 ? "DRIFT DETECTED" : "ALL STABLE"}
          </div>
          <div className="text-[11px] text-amber-400 font-mono">
            Max PSI: {Math.max(...modelDrifts.map((d) => d.populationStabilityIndex), 0.042)}
          </div>
        </Card>

        <Card className="space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>SUPPLY CHAIN HHI</span>
            <Layers className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 font-mono">
            {supplyChain.hhiIndex}
          </div>
          <div className="text-[11px] text-purple-400 font-mono">
            {supplyChain.concentrationLevel} Concentration
          </div>
        </Card>

        <Card className="space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>COMPLIANCE POSTURE</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 font-mono">
            {complianceDrift.score.toFixed(1)}%
          </div>
          <div className="text-[11px] text-emerald-400 font-mono">
            {complianceDrift.slaAlarms.length} SLA Alarms
          </div>
        </Card>
      </div>

      {/* Mandatory UI States Integration */}
      {incidents.some((i) => i.killSwitchEngaged) && (
        <DegradedState
          title="AI Safety Kill-Switch Engaged (Deterministic Fallback Active)"
          message="One or more LLM models are contained under emergency circuit breaker. Deterministic rules active."
          fallbackReason="EMERGENCY_AI_KILL_SWITCH_TRIGGERED"
        />
      )}

      {incidents.some((i) => i.fallbackModeActive && !i.killSwitchEngaged) && (
        <RecoveryState
          title="AI Multi-Vendor Tier-1 Failover in Progress"
          message="Routing inference queries to certified Tier-1 secondary model fallback provider."
          rollbackStage="Active Anthropic Claude / Deterministic Rule Switchover"
          progressPercent={85}
        />
      )}

      {/* Tabs */}
      <Tabs
        activeTab={activeTab}
        onChange={setActiveTab}
        tabs={[
          {
            id: "incidents",
            label: "§23 Incident Lifecycle & Kill-Switch",
            icon: <Flame className="w-4 h-4" />,
            badge: incidents.filter((i) => i.state !== "CLOSED").length,
          },
          {
            id: "envelopes",
            label: "§16.1 AI Review Envelopes",
            icon: <FileCheck2 className="w-4 h-4" />,
            badge: envelopes.filter((e) => e.controls.state === "UNREVIEWED").length || undefined,
          },
          {
            id: "inventory",
            label: "§05 AI Model Inventory (NIST/EU)",
            icon: <Boxes className="w-4 h-4" />,
            badge: models.filter((m) => m.lifecycleState !== "DECOMMISSIONED").length,
          },
          {
            id: "use-cases",
            label: "§05 Certified Use Cases",
            icon: <ShieldCheck className="w-4 h-4" />,
            badge: DEFAULT_USE_CASES.length,
          },
          {
            id: "grounding-gate",
            label: "§18 Grounding Gate Studio",
            icon: <Sparkles className="w-4 h-4" />,
          },
          {
            id: "drift",
            label: "§21 Model Drift & PSI",
            icon: <Activity className="w-4 h-4" />,
            badge: modelDrifts.length,
          },
          {
            id: "supply-chain",
            label: "§24 AI Supply Chain Risk (HHI)",
            icon: <Layers className="w-4 h-4" />,
          },
          {
            id: "compliance-drift",
            label: "§55 Compliance Drift & SLA Alarms",
            icon: <FileCheck2 className="w-4 h-4" />,
            badge: complianceDrift.slaAlarms.length || undefined,
          },
        ]}
      />

      {/* Tab 1: §23 AI Incident Lifecycle & Kill-Switch */}
      {activeTab === "incidents" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4">
            {incidents.map((incident, idx) => (
              <Card key={`${incident.id || "inc"}-${idx}`} className="space-y-4 border-l-4 border-l-rose-500">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-xs font-mono font-bold text-cyan-400">{incident.id}</span>
                      <Badge variant={incident.severity === "SEV1_CRITICAL" ? "critical" : "high"}>
                        {incident.severity}
                      </Badge>
                      {getStateBadge(incident.state)}
                      <span className="text-xs font-mono text-slate-400">Model: {incident.affectedModel}</span>
                    </div>
                    <h3 className="text-base font-bold text-slate-100">{incident.title}</h3>
                  </div>

                  <div className="text-xs font-mono text-slate-400">
                    Trigger: <span className="text-slate-200">{incident.trigger}</span> | Declared by:{" "}
                    <span className="text-slate-200">{incident.declaredBy}</span>
                  </div>
                </div>

                {/* State Transition Timeline Indicator */}
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                  <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
                    <span>STATE MACHINE TRANSITIONS</span>
                    <span>Current: <strong className="text-cyan-400">{incident.state}</strong></span>
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto text-xs font-mono py-1">
                    <span className={`px-2 py-1 rounded ${incident.state === "DECLARED" ? "bg-rose-500/20 text-rose-300 font-bold border border-rose-500/40" : "bg-slate-800 text-slate-400"}`}>1. DECLARED</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    <span className={`px-2 py-1 rounded ${incident.state === "CONTAINED_KILL_SWITCH" ? "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40" : incident.killSwitchEngaged ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-800 text-slate-400"}`}>2. KILL_SWITCH</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    <span className={`px-2 py-1 rounded ${incident.state === "FALLBACK_ACTIVE" ? "bg-purple-500/20 text-purple-300 font-bold border border-purple-500/40" : incident.fallbackModeActive ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-800 text-slate-400"}`}>3. FALLBACK</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    <span className={`px-2 py-1 rounded ${incident.state === "ROOT_CAUSE_ANALYZED" ? "bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40" : incident.rootCauseSummary ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-800 text-slate-400"}`}>4. RCA</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    <span className={`px-2 py-1 rounded ${incident.state === "RESOLVED" ? "bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40" : incident.resolvedAt ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-800 text-slate-400"}`}>5. RESOLVED</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    <span className={`px-2 py-1 rounded ${incident.state === "CLOSED" ? "bg-slate-700 text-slate-200 font-bold" : "bg-slate-800 text-slate-400"}`}>6. CLOSED</span>
                  </div>
                </div>

                {incident.rootCauseSummary && (
                  <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-500/30 text-xs font-mono text-purple-200 space-y-1">
                    <span className="font-bold text-purple-300">Root Cause Summary (§23 RCA):</span>
                    <p className="text-slate-300">{incident.rootCauseSummary}</p>
                  </div>
                )}

                {/* Lifecycle Action Buttons */}
                <div className="flex items-center gap-2 flex-wrap pt-2">
                  {incident.state === "DECLARED" && (
                    <Button
                      variant="danger"
                      size="sm"
                      isLoading={actionLoadingId === incident.id}
                      onClick={() => handleContain(incident.id)}
                    >
                      <ShieldX className="w-3.5 h-3.5" />
                      <span>Engage Kill-Switch (Simulated)</span>
                    </Button>
                  )}

                  {(incident.state === "DECLARED" || incident.state === "CONTAINED_KILL_SWITCH") && (
                    <Button
                      variant="ai"
                      size="sm"
                      isLoading={actionLoadingId === incident.id}
                      onClick={() => handleFallback(incident.id)}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>Activate Tier-1 Fallback Model</span>
                    </Button>
                  )}

                  {(incident.state === "CONTAINED_KILL_SWITCH" || incident.state === "FALLBACK_ACTIVE" || incident.state === "ROOT_CAUSE_ANALYZED") && (
                    <Button
                      variant="cyan"
                      size="sm"
                      isLoading={actionLoadingId === incident.id}
                      onClick={() => handleRca(incident.id)}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Synthesize 5-Whys RCA</span>
                    </Button>
                  )}

                  {incident.state === "ROOT_CAUSE_ANALYZED" && (
                    <Button
                      variant="primary"
                      size="sm"
                      isLoading={actionLoadingId === incident.id}
                      onClick={() => handleResolve(incident.id)}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Resolve Incident</span>
                    </Button>
                  )}

                  {incident.state === "RESOLVED" && (
                    <Button
                      variant="secondary"
                      size="sm"
                      isLoading={actionLoadingId === incident.id}
                      onClick={() => handleClose(incident.id)}
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Archive & Close Incident</span>
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Tab: §16.1 10-Field Mandatory AI Review Envelopes */}
      {activeTab === "envelopes" && (
        <div className="space-y-6">
          {envelopeActionMsg && (
            <div className="p-3 rounded-xl bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 text-xs font-mono flex items-center justify-between">
              <span>{envelopeActionMsg}</span>
              <button onClick={() => setEnvelopeActionMsg(null)} className="text-slate-400 hover:text-slate-200">✕</button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Envelope List (4 cols) */}
            <div className="lg:col-span-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 font-mono">
                  <FileCheck2 className="w-4 h-4 text-cyan-400" />
                  Review Envelopes ({envelopes.length})
                </h3>
                <span className="text-[11px] font-mono text-slate-400">Spec §16.1</span>
              </div>

              <div className="space-y-2.5">
                {envelopes.map((env) => {
                  const isSelected = selectedEnvelope?.envelopeId === env.envelopeId;
                  return (
                    <div
                      key={env.envelopeId}
                      onClick={() => setSelectedEnvelope(env)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer font-mono text-xs space-y-2 ${
                        isSelected
                          ? "bg-slate-800/90 border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.15)]"
                          : "bg-slate-900/50 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-cyan-300 font-bold text-xs truncate max-w-[170px]">
                          {env.envelopeId}
                        </span>
                        <Badge
                          variant={
                            env.controls.state === "ACCEPTED"
                              ? "pass"
                              : env.controls.state === "REJECTED"
                              ? "critical"
                              : env.controls.state === "ESCALATED"
                              ? "high"
                              : "ai"
                          }
                        >
                          {env.controls.state}
                        </Badge>
                      </div>

                      <div className="text-slate-300 text-[11px] font-sans truncate">
                        {env.aiLabelAndUseCaseName.useCaseName}
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-800">
                        <span>Model: {env.aiLabelAndUseCaseName.aiLabel}</span>
                        <span className="text-emerald-400 font-bold">
                          {(env.calibratedConfidenceAndUncertainty.score * 100).toFixed(0)}% Conf
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 10-Field Mandatory Envelope Inspector (8 cols) */}
            <div className="lg:col-span-8 space-y-4">
              {selectedEnvelope ? (
                <Card className="p-6 space-y-6 bg-slate-900/80 border-slate-800 backdrop-blur-md">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="ai">10-FIELD SPEC §16.1</Badge>
                        <span className="text-xs font-mono font-bold text-cyan-400">
                          {selectedEnvelope.envelopeId}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-white">
                        AI Review Envelope &amp; Human Oversight Authority
                      </h3>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          selectedEnvelope.controls.state === "ACCEPTED"
                            ? "pass"
                            : selectedEnvelope.controls.state === "REJECTED"
                            ? "critical"
                            : selectedEnvelope.controls.state === "ESCALATED"
                            ? "high"
                            : "ai"
                        }
                      >
                        {selectedEnvelope.controls.state}
                      </Badge>
                    </div>
                  </div>

                  {/* 10 Mandatory Spec Fields Display */}
                  <div className="space-y-4 text-xs font-mono">
                    {/* Field 1: AI Label & Use Case */}
                    <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/90 space-y-1.5">
                      <div className="flex items-center justify-between text-slate-400 text-[11px]">
                        <span className="font-bold text-cyan-400">1. AI LABEL &amp; USE CASE</span>
                        <span>Route: {selectedEnvelope.aiLabelAndUseCaseName.modelRoute}</span>
                      </div>
                      <div className="flex items-center gap-2 font-sans font-semibold text-slate-200">
                        <span>{selectedEnvelope.aiLabelAndUseCaseName.useCaseName}</span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-slate-400">
                          {selectedEnvelope.aiLabelAndUseCaseName.aiLabel} ({selectedEnvelope.aiLabelAndUseCaseName.version})
                        </span>
                      </div>
                    </div>

                    {/* Field 2: Sources & Spans */}
                    <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/90 space-y-2">
                      <div className="text-[11px] font-bold text-cyan-400">
                        2. DECISION SOURCES &amp; GROUND TRUTH SPANS ({selectedEnvelope.sourcesAndSpans.length})
                      </div>
                      <div className="space-y-1.5">
                        {selectedEnvelope.sourcesAndSpans.map((src, sIdx) => (
                          <div key={sIdx} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 space-y-1">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-emerald-400 font-bold">{src.sourceId} ({src.sourceType})</span>
                              <span className="text-cyan-300">{((src.confidence ?? src.confidenceScore ?? 1) * 100).toFixed(1)}% Confidence</span>
                            </div>
                            <p className="text-slate-300 font-sans text-xs">&quot;{src.exactSpan}&quot;</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Fields 3 & 4: Evidence Completeness & Calibrated Confidence */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/90 space-y-1.5">
                        <span className="font-bold text-cyan-400 text-[11px]">3. EVIDENCE COMPLETENESS</span>
                        <div className="text-[11px] text-slate-300 space-y-1">
                          <div>Missing: <strong className="text-slate-400">{selectedEnvelope.knownMissingStaleOrConflictingEvidence?.missingEvidence?.join(", ") || "None (Complete)"}</strong></div>
                          <div>Stale: <strong className="text-slate-400">{selectedEnvelope.knownMissingStaleOrConflictingEvidence?.staleEvidence?.join(", ") || "None"}</strong></div>
                          <div>Conflicting: <strong className="text-slate-400">{selectedEnvelope.knownMissingStaleOrConflictingEvidence?.conflictingEvidence?.join(", ") || "None"}</strong></div>
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/90 space-y-1.5">
                        <span className="font-bold text-cyan-400 text-[11px]">4. CALIBRATED CONFIDENCE</span>
                        <div className="flex items-center justify-between">
                          <span className="text-xl font-bold text-emerald-400">
                            {(selectedEnvelope.calibratedConfidenceAndUncertainty.score * 100).toFixed(1)}%
                          </span>
                          <Badge variant="healthy">{selectedEnvelope.calibratedConfidenceAndUncertainty.qualitativeBand}</Badge>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-tight">
                          {selectedEnvelope.calibratedConfidenceAndUncertainty.calibrationBasis}
                        </p>
                      </div>
                    </div>

                    {/* Field 5 & 6: Alternatives & Impact/Reversibility */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/90 space-y-1.5">
                        <span className="font-bold text-cyan-400 text-[11px]">5. ALTERNATIVE HYPOTHESES / ACTIONS</span>
                        {selectedEnvelope.alternativeHypothesesOrActions.map((alt, aIdx) => (
                          <div key={aIdx} className="text-[11px] text-slate-300">
                            <div className="font-bold text-white">{alt.title}</div>
                            <div className="text-slate-400">{alt.tradeOffs}</div>
                          </div>
                        ))}
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/90 space-y-1.5">
                        <span className="font-bold text-cyan-400 text-[11px]">6. IMPACT &amp; REVERSIBILITY</span>
                        <div className="text-[11px] text-slate-300 space-y-0.5">
                          <div>Blast Radius: <strong className="text-slate-200">{selectedEnvelope.expectedImpactAndReversibility.blastRadius}</strong></div>
                          <div>Reversible: <strong className="text-emerald-400">{selectedEnvelope.expectedImpactAndReversibility.isReversible ? "YES" : "NO"}</strong> ({selectedEnvelope.expectedImpactAndReversibility.reversibilityTier})</div>
                        </div>
                      </div>
                    </div>

                    {/* Fields 7, 8, 9, 10: Authority, Controls & Recorded Human Decision */}
                    <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/90 space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-cyan-400">7-10. HUMAN DECISION CONTROLS &amp; APPEAL ROUTE</span>
                        <span className="text-slate-400">Required Role: {selectedEnvelope.requiredAuthorityAndApprovals.requiredRole} ({selectedEnvelope.requiredAuthorityAndApprovals.responseAuthorityTier})</span>
                      </div>

                      {selectedEnvelope.humanDecisionAndRationale.decision ? (
                        <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/40 space-y-1 text-xs">
                          <div className="flex items-center justify-between text-emerald-300 font-bold">
                            <span>RECORDED DECISION: {selectedEnvelope.humanDecisionAndRationale.decision}</span>
                            <span className="text-slate-400 text-[10px]">{selectedEnvelope.humanDecisionAndRationale.decidedAt}</span>
                          </div>
                          <p className="text-slate-300">By: {selectedEnvelope.humanDecisionAndRationale.decidedBy} — &quot;{selectedEnvelope.humanDecisionAndRationale.rationale}&quot;</p>
                        </div>
                      ) : (
                        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2 text-xs">
                          <span className="text-slate-400 block font-sans">Pending operator authority signoff:</span>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleEnvelopeTransition(selectedEnvelope.envelopeId, "ACCEPT", "Signed off under §16.1 authority")}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>ACCEPT PROPOSAL</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEnvelopeTransition(selectedEnvelope.envelopeId, "MODIFY", "Modified containment scope")}
                            >
                              <span>MODIFY SCOPE</span>
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleEnvelopeTransition(selectedEnvelope.envelopeId, "REJECT", "Operator rejected proposal")}
                            >
                              <span>REJECT</span>
                            </Button>
                            <Button
                              variant="ai"
                              size="sm"
                              onClick={() => handleEnvelopeTransition(selectedEnvelope.envelopeId, "ESCALATE", "Escalated to Lead CISO")}
                            >
                              <span>ESCALATE TO CISO</span>
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ) : (
                <p className="text-xs text-slate-500 py-12 text-center">
                  Select a review envelope to view §16.1 mandatory fields.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: §05 AI System Inventory & Risk Registry (NIST/EU AI Act) */}
      {activeTab === "inventory" && (
        <div className="space-y-6">
          <Card className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <Boxes className="w-4 h-4 text-cyan-400" />
                  AI System Inventory & Risk Registry (§05)
                </h3>
                <p className="text-xs text-slate-400">
                  Governed under NIST AI RMF 1.0 (Govern, Map, Measure, Manage) and EU AI Act (Regulation EU 2024/1689).
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setIsRegisteringModel(true)}
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Register Model Profile</span>
                </Button>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs font-mono">
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="text"
                  placeholder="Filter models by ID, provider, family, or purpose..."
                  value={inventorySearch}
                  onChange={(e) => setInventorySearch(e.target.value)}
                  className="w-full max-w-sm px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-sans"
                />
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 text-[11px]">Lifecycle:</span>
                  <select
                    value={filterLifecycle}
                    onChange={(e) => setFilterLifecycle(e.target.value)}
                    className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
                  >
                    <option value="ALL">ALL STATES</option>
                    <option value="APPROVED_FOR_PRODUCTION">APPROVED FOR PROD</option>
                    <option value="EVALUATING">EVALUATING</option>
                    <option value="PROPOSED">PROPOSED</option>
                    <option value="DECOMMISSIONED">DECOMMISSIONED</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 text-[11px]">EU Risk Tier:</span>
                  <select
                    value={filterRisk}
                    onChange={(e) => setFilterRisk(e.target.value)}
                    className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
                  >
                    <option value="ALL">ALL TIERS</option>
                    <option value="MINIMAL_RISK">MINIMAL_RISK</option>
                    <option value="LIMITED_RISK">LIMITED_RISK</option>
                    <option value="HIGH_RISK">HIGH_RISK</option>
                    <option value="UNACCEPTABLE_RISK">UNACCEPTABLE_RISK</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Model Registry Cards */}
            <div className="grid grid-cols-1 gap-4">
              {models
                .filter((m) => {
                  if (filterLifecycle !== "ALL" && m.lifecycleState !== filterLifecycle) return false;
                  if (filterRisk !== "ALL" && m.euAiActClassification !== filterRisk) return false;
                  if (inventorySearch.trim()) {
                    const q = inventorySearch.toLowerCase();
                    return (
                      m.modelId.toLowerCase().includes(q) ||
                      m.provider.toLowerCase().includes(q) ||
                      m.modelFamily.toLowerCase().includes(q) ||
                      m.purpose.toLowerCase().includes(q)
                    );
                  }
                  return true;
                })
                .map((model, idx) => (
                  <div
                    key={`${model.modelId}-${idx}`}
                    className={`p-5 rounded-xl border transition-all ${
                      model.lifecycleState === "APPROVED_FOR_PRODUCTION"
                        ? "bg-slate-900/80 border-slate-700 hover:border-cyan-500/40"
                        : model.lifecycleState === "EVALUATING"
                        ? "bg-cyan-950/20 border-cyan-500/30"
                        : model.lifecycleState === "DECOMMISSIONED"
                        ? "bg-slate-950/40 border-slate-800/80 opacity-60"
                        : "bg-amber-950/20 border-amber-500/30"
                    } space-y-4 font-mono text-xs`}
                  >
                    {/* Header Row */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded bg-purple-950/50 border border-purple-500/40 text-purple-300 font-bold text-[11px]">
                            {model.provider}
                          </span>
                          <span className="font-bold text-sm text-cyan-300 font-sans">
                            {model.modelId}
                          </span>
                          <span className="text-slate-400 text-[11px]">v{model.version}</span>
                          <span className="text-slate-500 text-[11px]">({model.modelFamily})</span>
                          {getLifecycleBadge(model.lifecycleState)}
                          {getRiskTierBadge(model.euAiActClassification)}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                        <span>
                          Inference Share:{" "}
                          <strong className="text-cyan-400 font-bold">
                            {((model.hhiWeight || 0.1) * 100).toFixed(0)}%
                          </strong>
                        </span>
                        <span>•</span>
                        <span>
                          Human Oversight:{" "}
                          <strong
                            className={
                              model.humanOversightRequired ? "text-amber-400" : "text-emerald-400"
                            }
                          >
                            {model.humanOversightRequired ? "MANDATORY (2-Man)" : "PERMITTED TIER-2"}
                          </strong>
                        </span>
                      </div>
                    </div>

                    {/* Purpose Description */}
                    <div className="space-y-1">
                      <span className="text-[11px] text-slate-400 uppercase tracking-wider">
                        Operational Mandate & Role:
                      </span>
                      <p className="text-slate-200 font-sans text-xs leading-relaxed">
                        {model.purpose}
                      </p>
                    </div>

                    {/* Details Grid: Use Cases, NIST Alignment & Fallback */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1.5">
                        <span className="text-[11px] text-slate-400">PRIMARY USE CASES</span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {model.primaryUseCaseKeys?.map((uc, uIdx) => (
                            <span
                              key={uIdx}
                              className="px-1.5 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-500/30 text-[10px]"
                            >
                              {uc}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1.5">
                        <span className="text-[11px] text-slate-400">NIST AI RMF 1.0 FUNCTIONS</span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {model.nistRmfAlignment?.map((fn, fIdx) => (
                            <span
                              key={fIdx}
                              className="px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold"
                            >
                              {fn}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1">
                        <span className="text-[11px] text-slate-400">DETERMINISTIC FALLBACK ENGINE</span>
                        <p className="text-slate-300 text-[11px] font-mono truncate">
                          {model.deterministicFallbackEngine || "Rule-Based Deterministic Fallback"}
                        </p>
                      </div>
                    </div>

                    {/* Lifecycle Action Bar */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 gap-2 flex-wrap">
                      <div className="text-[11px] text-slate-500 font-mono">
                        Updated: {model.updatedAt ? new Date(model.updatedAt).toLocaleDateString() : "Active"}
                      </div>

                      <div className="flex items-center gap-2">
                        {model.lifecycleState === "PROPOSED" && (
                          <>
                            <Button
                              variant="ai"
                              size="sm"
                              isLoading={actionLoadingId === `lifecycle-${model.modelId}`}
                              onClick={() => handleUpdateModelLifecycle(model.modelId, "EVALUATING")}
                            >
                              <Activity className="w-3.5 h-3.5" />
                              <span>Begin Safety Evaluation</span>
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              isLoading={actionLoadingId === `lifecycle-${model.modelId}`}
                              onClick={() =>
                                handleUpdateModelLifecycle(model.modelId, "APPROVED_FOR_PRODUCTION")
                              }
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Approve for Production</span>
                            </Button>
                          </>
                        )}

                        {model.lifecycleState === "EVALUATING" && (
                          <Button
                            variant="primary"
                            size="sm"
                            isLoading={actionLoadingId === `lifecycle-${model.modelId}`}
                            onClick={() =>
                              handleUpdateModelLifecycle(model.modelId, "APPROVED_FOR_PRODUCTION")
                            }
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Conformity Pass: Approve for Prod</span>
                          </Button>
                        )}

                        {model.lifecycleState === "APPROVED_FOR_PRODUCTION" && (
                          <Button
                            variant="secondary"
                            size="sm"
                            isLoading={actionLoadingId === `lifecycle-${model.modelId}`}
                            onClick={() => handleUpdateModelLifecycle(model.modelId, "EVALUATING")}
                          >
                            <Sliders className="w-3.5 h-3.5" />
                            <span>Revoke to Evaluation</span>
                          </Button>
                        )}

                        {model.lifecycleState !== "DECOMMISSIONED" && (
                          <Button
                            variant="danger"
                            size="sm"
                            isLoading={actionLoadingId === `delete-${model.modelId}`}
                            onClick={() => handleDecommissionModel(model.modelId)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Decommission</span>
                          </Button>
                        )}

                        {model.lifecycleState === "DECOMMISSIONED" && (
                          <Button
                            variant="secondary"
                            size="sm"
                            isLoading={actionLoadingId === `lifecycle-${model.modelId}`}
                            onClick={() => handleUpdateModelLifecycle(model.modelId, "PROPOSED")}
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Re-propose Model</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </Card>
        </div>
      )}

      {/* Tab 3: §21 Model Stability & Population Stability Index (PSI) */}
      {activeTab === "drift" && (
        <div className="space-y-6">
          <Card className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-amber-400" />
                  Model Drift & Population Stability Index (§21)
                </h3>
                <p className="text-xs text-slate-400">
                  Statistical evaluation comparing active telemetry inference token distributions against validated baseline embeddings.
                </p>
              </div>
              <Badge variant="healthy">PSI Thresholds: &lt;0.10 Stable | &gt;0.25 Critical</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {modelDrifts.map((report, idx) => (
                <div
                  key={`${report.modelId || "model"}-${idx}`}
                  className={`p-4 rounded-xl border ${
                    report.status === "CRITICAL_DRIFT_DETECTED"
                      ? "bg-rose-950/20 border-rose-500/40"
                      : report.status === "WARNING_DRIFT_DETECTED"
                      ? "bg-amber-950/20 border-amber-500/40"
                      : "bg-slate-900/60 border-slate-800"
                  } space-y-3 font-mono`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200">{report.modelId}</span>
                    <Badge variant={report.status === "STABLE" ? "pass" : report.status === "WARNING_DRIFT_DETECTED" ? "medium" : "critical"}>
                      {report.status}
                    </Badge>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-300">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">PSI Metric:</span>
                      <span className={`font-bold ${report.populationStabilityIndex >= 0.25 ? "text-rose-400" : report.populationStabilityIndex >= 0.10 ? "text-amber-400" : "text-emerald-400"}`}>
                        {report.populationStabilityIndex.toFixed(3)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Token Length PSI:</span>
                      <span>{report.tokenLengthPsi.toFixed(3)}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Confidence Shift:</span>
                      <span className={report.confidenceShiftPct < 0 ? "text-amber-400" : "text-emerald-400"}>
                        {report.confidenceShiftPct > 0 ? `+${report.confidenceShiftPct}%` : `${report.confidenceShiftPct}%`}
                      </span>
                    </div>
                  </div>

                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full ${report.populationStabilityIndex >= 0.25 ? "bg-rose-500" : report.populationStabilityIndex >= 0.10 ? "bg-amber-500" : "bg-emerald-500"}`}
                      style={{ width: `${Math.min(100, report.populationStabilityIndex * 300)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Tab 3: §24 AI Supply Chain Concentration Risk */}
      {activeTab === "supply-chain" && (
        <div className="space-y-6">
          <Card className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-400" />
                  AI Model Supply Chain Concentration (§24)
                </h3>
                <p className="text-xs text-slate-400">
                  Herfindahl-Hirschman Index (HHI) monitoring single-vendor dependence across foundation model providers.
                </p>
              </div>
              <Badge variant="ai">HHI Score: {supplyChain.hhiIndex}</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <h4 className="text-sm font-semibold text-slate-200">Provider Inference Share</h4>
                <div className="space-y-3">
                  {Object.entries(supplyChain.providerShares).map(([provider, share]) => (
                    <div key={provider} className="space-y-1 text-xs font-mono">
                      <div className="flex items-center justify-between text-slate-300">
                        <span>{provider}</span>
                        <span className="font-bold text-cyan-400">{share}%</span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div className="bg-cyan-500 h-full" style={{ width: `${share}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <h4 className="text-sm font-semibold text-slate-200">Multi-Vendor Fallback Posture</h4>
                <div className="space-y-2.5 text-xs text-slate-300 font-mono">
                  <div className="flex items-center justify-between p-2 rounded bg-slate-800/60">
                    <span>Primary Provider:</span>
                    <span className="text-cyan-300 font-bold">{supplyChain.primaryProvider}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-slate-800/60">
                    <span>Concentration Level:</span>
                    <span className="text-purple-300 font-bold">{supplyChain.concentrationLevel}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-slate-800/60">
                    <span>Tier-1 Fallback Standby:</span>
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> READY (Claude & vLLM)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 4: §55 Continuous Compliance Drift & SLA Alarms */}
      {activeTab === "compliance-drift" && (
        <div className="space-y-6">
          <Card className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <FileCheck2 className="w-4 h-4 text-emerald-400" />
                  Continuous Compliance Drift & Real-Time SLA Alarms (§55)
                </h3>
                <p className="text-xs text-slate-400">
                  Real-time telemetry evaluation against active SOC 2 CC6.1 and ISO 27001:2022 compliance thresholds.
                </p>
              </div>
              <Badge variant="pass">Overall Compliance: {complianceDrift.score.toFixed(1)}%</Badge>
            </div>

            {complianceDrift.slaAlarms.length === 0 ? (
              <div className="p-6 text-center text-xs font-mono text-emerald-400 bg-emerald-950/20 border border-emerald-500/30 rounded-xl">
                ✓ All Continuous Compliance Controls Operating Within Nominal SLA Tolerances. Zero Alarms.
              </div>
            ) : (
              <div className="space-y-3">
                {complianceDrift.slaAlarms.map((alarm, idx) => (
                  <div
                    key={`${alarm.alarmId || "alarm"}-${idx}`}
                    className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/40 flex flex-col md:flex-row md:items-center justify-between gap-4 font-mono text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="high">{alarm.severity}</Badge>
                        <span className="font-bold text-cyan-300">{alarm.controlId}</span>
                        <span className="text-slate-400 text-[11px]">{alarm.alarmId}</span>
                      </div>
                      <p className="text-slate-300 font-sans text-xs">{alarm.reason}</p>
                    </div>

                    <Button
                      variant="cyan"
                      size="sm"
                      isLoading={actionLoadingId === alarm.alarmId}
                      onClick={() => handleRemediateAlarm(alarm.alarmId)}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Simulate Auto-Remediation</span>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Tab 5: §05 Certified AI Use Cases Catalog */}
      {activeTab === "use-cases" && (
        <div className="space-y-6">
          <Card className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Certified AI Use Cases & Governance Catalog (§05)
                </h3>
                <p className="text-xs text-slate-400">
                  Pre-approved AI operational mandates mapped to EU AI Act risk classifications, NIST AI RMF functions, and mandatory human oversight tiers.
                </p>
              </div>
              <Badge variant="pass">{DEFAULT_USE_CASES.length} Active Use Cases</Badge>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {DEFAULT_USE_CASES.map((uc) => (
                <div
                  key={uc.key}
                  className="p-5 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-emerald-500/40 transition-all space-y-3 font-mono text-xs"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-2 border-b border-slate-800">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-cyan-300 font-sans">{uc.name}</span>
                        <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] text-slate-400">
                          {uc.key}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            uc.riskTier === "AR-3"
                              ? "bg-rose-950/60 text-rose-300 border-rose-500/50"
                              : uc.riskTier === "AR-2"
                              ? "bg-amber-950/60 text-amber-300 border-amber-500/50"
                              : "bg-emerald-950/60 text-emerald-300 border-emerald-500/50"
                          }`}
                        >
                          {uc.riskTier}: {uc.riskTier === "AR-1" ? "Assistive Low" : uc.riskTier === "AR-2" ? "Controlled Advisory" : "High-Control Agentic"}
                        </span>
                        {getRiskTierBadge(uc.euRiskTier)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="ai">{uc.governanceStatus}</Badge>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        uc.humanOversightPolicy.includes("DUAL_CUSTODY")
                          ? "bg-amber-950/50 text-amber-300 border-amber-500/40"
                          : uc.humanOversightPolicy.includes("HUMAN_IN_THE_LOOP")
                          ? "bg-purple-950/50 text-purple-300 border-purple-500/40"
                          : "bg-emerald-950/50 text-emerald-300 border-emerald-500/40"
                      }`}>
                        {uc.humanOversightPolicy}
                      </span>
                    </div>
                  </div>

                  <p className="text-slate-300 font-sans text-xs leading-relaxed">{uc.description}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider">Pinned Model & Grounding:</span>
                      <p className="text-cyan-300 text-[11px] font-mono truncate">{uc.pinnedModelVersion}</p>
                      <span className="text-[10px] text-slate-400">Min Grounding: {(uc.minGroundingScore * 100).toFixed(0)}%</span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider">Deterministic Fallback:</span>
                      <p className="text-amber-300 text-[11px] font-mono truncate">{uc.fallbackEngine}</p>
                      <span className="text-[10px] text-slate-400">Zero-LLM Safe Mode</span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider">NIST AI RMF Core Functions:</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {uc.nistFunctions.map((fn, fIdx) => (
                          <span key={fIdx} className="px-1.5 py-0.5 rounded bg-emerald-950/50 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                            {fn}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Tab 6: §18 Grounding Gate & Anti-Hallucination Studio */}
      {activeTab === "grounding-gate" && (
        <div className="space-y-6">
          <Card className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  Grounding Gate &amp; Anti-Hallucination Studio (§18)
                </h3>
                <p className="text-xs text-slate-400">
                  Enforces domain-differentiated thresholds (SOC 2 / ISO 27001 &ge;0.98 precision vs threat triage &ge;0.90) and verified Evidence Ledger citation support before allowing AI generated conclusions into incident case files.
                </p>
              </div>
              <Badge variant="healthy">Grounding Gate: ACTIVE</Badge>
            </div>

            {/* §17 Domain-Differentiated Mode Preset Selector */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-slate-400 font-bold uppercase">§17 Domain Mode:</span>
                <span className="text-cyan-300 font-bold">
                  {domainMode === "COMPLIANCE" ? "SOC 2 / ISO 27001 Evidence Synthesis" : domainMode === "DETECTION" ? "Threat Triage & MITRE Correlation" : "General Exploratory"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-xs flex-wrap">
                <button
                  type="button"
                  onClick={() => handleDomainChange("COMPLIANCE")}
                  className={`px-3 py-1.5 rounded-lg border font-bold transition-all ${
                    domainMode === "COMPLIANCE"
                      ? "bg-purple-950/80 border-purple-500/50 text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.2)]"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  🔒 COMPLIANCE (&ge;98% / &ge;95%)
                </button>
                <button
                  type="button"
                  onClick={() => handleDomainChange("DETECTION")}
                  className={`px-3 py-1.5 rounded-lg border font-bold transition-all ${
                    domainMode === "DETECTION"
                      ? "bg-cyan-950/80 border-cyan-500/50 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.2)]"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  ⚡ DETECTION (&ge;90% / &ge;85%)
                </button>
                <button
                  type="button"
                  onClick={() => handleDomainChange("GENERAL")}
                  className={`px-3 py-1.5 rounded-lg border font-bold transition-all ${
                    domainMode === "GENERAL"
                      ? "bg-slate-800 border-slate-600 text-slate-200"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  🌐 GENERAL (&ge;80% / &ge;75%)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Input Area */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-slate-300 font-bold flex items-center justify-between">
                    <span>1. AI Model Generated Claim / Hypothesis:</span>
                    <span className="text-slate-500 text-[11px]">Target under verification</span>
                  </label>
                  <textarea
                    rows={4}
                    value={gateHypothesis}
                    onChange={(e) => setGateHypothesis(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-cyan-400 font-mono leading-relaxed resize-none"
                    placeholder="Enter AI model generated text..."
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-slate-300 font-bold flex items-center justify-between">
                    <span>2. Anchored Evidence Citations (Ground Truth Spans):</span>
                    <span className="text-cyan-400 text-[11px]">From Sovereign Evidence Ledger</span>
                  </label>
                  <textarea
                    rows={4}
                    value={gateEvidenceSpans}
                    onChange={(e) => setGateEvidenceSpans(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-cyan-400 font-mono leading-relaxed resize-none"
                    placeholder="Enter evidence ledger records..."
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs font-mono">
                  <span className="text-slate-400">Gate Grounding Threshold:</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0.5"
                      max="0.95"
                      step="0.05"
                      value={gateThreshold}
                      onChange={(e) => setGateThreshold(parseFloat(e.target.value))}
                      className="w-32 accent-cyan-400"
                    />
                    <span className="font-bold text-cyan-300 w-10 text-right">{(gateThreshold * 100).toFixed(0)}%</span>
                  </div>
                </div>

                <Button
                  variant="primary"
                  className="w-full py-2.5 font-bold flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 shadow-lg shadow-cyan-900/30"
                  onClick={handleEvaluateGrounding}
                  disabled={isEvaluatingGate}
                >
                  {isEvaluatingGate ? (
                    <>
                      <Activity className="w-4 h-4 animate-spin" />
                      <span>Verifying Grounding Spans against Ledger...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Run Grounding Gate Verification</span>
                    </>
                  )}
                </Button>
              </div>

              {/* Evaluation Output Area */}
              <div className="space-y-4 font-mono text-xs">
                {gateResult ? (
                  <div className="space-y-4">
                    <div className={`p-4 rounded-xl border ${
                      gateResult.decision === "PERMITTED"
                        ? "bg-emerald-950/30 border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.15)]"
                        : "bg-rose-950/30 border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.15)]"
                    } space-y-3`}>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 text-xs">VERIFICATION DECISION:</span>
                        <Badge variant={gateResult.decision === "PERMITTED" ? "pass" : "critical"}>
                          {gateResult.decision}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                          <span className="text-[10px] text-slate-400">GROUNDING SCORE:</span>
                          <p className={`text-xl font-black ${
                            gateResult.groundingScore >= gateThreshold ? "text-emerald-400" : "text-rose-400"
                          }`}>
                            {(gateResult.groundingScore * 100).toFixed(1)}%
                          </p>
                          <span className="text-[10px] text-slate-500">Threshold: {(gateThreshold * 100).toFixed(0)}%</span>
                        </div>

                        <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                          <span className="text-[10px] text-slate-400">SUPPORTED TOKENS:</span>
                          <p className="text-xl font-black text-cyan-300">
                            {gateResult.supportedTokens} / {gateResult.totalTokens}
                          </p>
                          <span className="text-[10px] text-slate-500">Coverage: {gateResult.citationCoveragePct}%</span>
                        </div>
                      </div>

                      <div className="space-y-1.5 pt-1">
                        <span className="text-[11px] text-slate-400 uppercase">Verified Citations:</span>
                        <div className="space-y-1">
                          {gateResult.verifiedCitations.map((cit, cIdx) => (
                            <div key={cIdx} className="flex items-center gap-1.5 text-[11px] text-emerald-300">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              <span>{cit}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {gateResult.hallucinatedSpans.length > 0 && (
                        <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/40 space-y-1">
                          <span className="text-[11px] font-bold text-rose-300">⚠️ Ungrounded / Hallucinated Spans:</span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {gateResult.hallucinatedSpans.map((span, sIdx) => (
                              <span key={sIdx} className="px-2 py-0.5 rounded bg-rose-900/60 text-rose-200 border border-rose-500/40 text-[10px]">
                                {span}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-8 rounded-xl bg-slate-900/40 border border-slate-800/80 text-center space-y-2">
                    <Sparkles className="w-8 h-8 text-cyan-400/50 mx-auto" />
                    <h4 className="text-sm font-bold text-slate-300">Grounding Gate Idle</h4>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      Click &quot;Run Grounding Gate Verification&quot; to analyze the hypothesis against evidence ledger ground truth.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Register AI Model Modal */}
      <Modal
        isOpen={isRegisteringModel}
        onClose={() => setIsRegisteringModel(false)}
        title="Register AI Model Profile (§05)"
        description="Add a new foundation model or local inference agent to the NIST AI RMF & EU AI Act governance registry."
      >
        <form onSubmit={handleRegisterModel} className="space-y-4 font-sans">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-300">Model ID (Unique Identifier)</label>
              <input
                type="text"
                required
                placeholder="e.g. gpt-4o-security"
                value={formModelId}
                onChange={(e) => setFormModelId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-300">Provider</label>
              <select
                value={formProvider}
                onChange={(e) => setFormProvider(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
              >
                <option value="Google">Google (Vertex AI)</option>
                <option value="Anthropic">Anthropic (Claude)</option>
                <option value="OpenAI">OpenAI (Azure / Direct)</option>
                <option value="Local">Local (vLLM / Ollama)</option>
                <option value="Mistral">Mistral AI</option>
                <option value="Meta">Meta (Llama 3)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-300">Model Family</label>
              <input
                type="text"
                required
                placeholder="e.g. GPT-4, Claude, Gemini"
                value={formModelFamily}
                onChange={(e) => setFormModelFamily(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-400 font-sans"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-300">Version / Checkpoint</label>
              <input
                type="text"
                required
                placeholder="e.g. 2026-05-preview"
                value={formVersion}
                onChange={(e) => setFormVersion(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-300">EU AI Act Risk Classification</label>
              <select
                value={formEuRisk}
                onChange={(e) => setFormEuRisk(e.target.value as EuAiActRiskTier)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
              >
                <option value="MINIMAL_RISK">MINIMAL_RISK (Unregulated / Broad Utility)</option>
                <option value="LIMITED_RISK">LIMITED_RISK (Transparency & Labeling Mandated)</option>
                <option value="HIGH_RISK">HIGH_RISK (Strict Conformity & Human-in-the-Loop)</option>
                <option value="UNACCEPTABLE_RISK">UNACCEPTABLE_RISK (Prohibited)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-300">Initial Lifecycle State</label>
              <select
                value={formLifecycleState}
                onChange={(e) => setFormLifecycleState(e.target.value as AiLifecycleState)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
              >
                <option value="PROPOSED">PROPOSED (Under Safety Review)</option>
                <option value="EVALUATING">EVALUATING (Sandbox Testing)</option>
                <option value="APPROVED_FOR_PRODUCTION">APPROVED_FOR_PRODUCTION</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-300">NIST AI RMF 1.0 Aligned Core Functions</label>
            <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
              {(["GOVERN", "MAP", "MEASURE", "MANAGE"] as NistAiRmfFunction[]).map((fn) => (
                <button
                  type="button"
                  key={fn}
                  onClick={() => toggleNistFunction(fn)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                    formNistFunctions.includes(fn)
                      ? "bg-cyan-950/60 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.3)]"
                      : "bg-slate-900/60 border-slate-700 text-slate-400"
                  }`}
                >
                  {formNistFunctions.includes(fn) ? "✓ " : "+ "}
                  {fn}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-300">Purpose / Role Description</label>
            <textarea
              rows={2}
              required
              placeholder="Describe the operational mandate and security boundary of this model..."
              value={formPurpose}
              onChange={(e) => setFormPurpose(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-400 font-sans"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-300">Primary Use Case Keys (comma-separated)</label>
              <input
                type="text"
                required
                placeholder="RESPONSE_RECOMMENDATION, INVESTIGATION_HYPOTHESIS"
                value={formUseCases}
                onChange={(e) => setFormUseCases(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-300">Deterministic Fallback Engine</label>
              <input
                type="text"
                required
                placeholder="Tier-1 Deterministic RCA Rule Engine"
                value={formFallbackEngine}
                onChange={(e) => setFormFallbackEngine(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-400 font-sans"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-300">HHI Inference Share Weight (0.05 - 1.0)</label>
              <input
                type="number"
                step="0.05"
                min="0.01"
                max="1.0"
                value={formHhiWeight}
                onChange={(e) => setFormHhiWeight(parseFloat(e.target.value) || 0.1)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
              />
            </div>

            <div className="flex items-center gap-3 pt-4">
              <input
                type="checkbox"
                id="humanOversight"
                checked={formHumanOversight}
                onChange={(e) => setFormHumanOversight(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-cyan-400 focus:ring-0"
              />
              <label htmlFor="humanOversight" className="text-xs font-mono text-slate-200 cursor-pointer">
                Mandatory Human Oversight (§08 Dual-Custody)
              </label>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
            <Button variant="ghost" size="sm" type="button" onClick={() => setIsRegisteringModel(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={actionLoadingId === "register-model"}>
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Register Model Profile</span>
            </Button>
          </div>
        </form>
      </Modal>

      {/* Declare Incident Modal */}
      <Modal
        isOpen={isDeclaring}
        onClose={() => setIsDeclaring(false)}
        title="Declare Safety Incident (§23)"
        description="Initiate formal AI Safety incident lifecycle tracking with automatic containment options."
      >
        <form onSubmit={handleDeclareIncident} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-300">Incident Title / Symptom</label>
            <input
              type="text"
              required
              placeholder="e.g. Indirect Prompt Injection Bypass in Log Classifier"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-400 font-sans"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-300">Severity Level</label>
              <select
                value={newSeverity}
                onChange={(e) => setNewSeverity(e.target.value as AiIncidentSeverity)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
              >
                <option value="SEV1_CRITICAL">SEV1_CRITICAL (Kill-Switch Candidate)</option>
                <option value="SEV2_HIGH">SEV2_HIGH (Fallback Recommended)</option>
                <option value="SEV3_MEDIUM">SEV3_MEDIUM</option>
                <option value="SEV4_LOW">SEV4_LOW</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-300">Trigger Mechanism</label>
              <select
                value={newTrigger}
                onChange={(e) => setNewTrigger(e.target.value as AiIncidentTrigger)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
              >
                <option value="PROMPT_INJECTION">PROMPT_INJECTION</option>
                <option value="MODEL_HALLUCINATION">MODEL_HALLUCINATION</option>
                <option value="MODEL_DRIFT_CRITICAL">MODEL_DRIFT_CRITICAL</option>
                <option value="DATA_LEAKAGE">DATA_LEAKAGE</option>
                <option value="TOOL_MISUSE">TOOL_MISUSE</option>
                <option value="OPERATOR_MANUAL">OPERATOR_MANUAL</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-300">Affected Model</label>
            <input
              type="text"
              required
              value={newModel}
              onChange={(e) => setNewModel(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
            />
          </div>

          <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
            <Button variant="ghost" size="sm" type="button" onClick={() => setIsDeclaring(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" type="submit" isLoading={actionLoadingId === "declare"}>
              <Flame className="w-3.5 h-3.5" />
              <span>Declare Incident</span>
            </Button>
          </div>
        </form>
      </Modal>

      {/* RCA 5-Whys Analysis Modal */}
      {activeRca && (
        <Modal
          isOpen={isRcaModalOpen}
          onClose={() => setIsRcaModalOpen(false)}
          title="Automated 5-Whys Root Cause Analysis (§23)"
          description={`Automated deep-dive analysis for incident ${activeRca.incident.id}`}
        >
          <div className="space-y-4 font-mono text-xs text-slate-300">
            <div className="p-3 rounded-lg bg-purple-950/40 border border-purple-500/40 space-y-1">
              <span className="font-bold text-purple-300">Executive RCA Summary:</span>
              <p className="text-slate-200 font-sans text-xs">{activeRca.rcaSummary}</p>
            </div>

            <div className="space-y-2">
              <span className="font-bold text-cyan-300">5-Whys Causality Chain:</span>
              <div className="space-y-1.5 pl-2 border-l-2 border-cyan-500/40">
                {activeRca.fiveWhys.map((why, idx) => (
                  <p key={idx} className="text-slate-300">
                    {why}
                  </p>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <span className="font-bold text-emerald-300">Recommended Engineering Fixes:</span>
              <ul className="list-disc pl-5 space-y-1 text-slate-300">
                {activeRca.recommendedFixes.map((fix, idx) => (
                  <li key={idx}>{fix}</li>
                ))}
              </ul>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <Button variant="primary" size="sm" onClick={() => setIsRcaModalOpen(false)}>
                Close RCA Viewer
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
