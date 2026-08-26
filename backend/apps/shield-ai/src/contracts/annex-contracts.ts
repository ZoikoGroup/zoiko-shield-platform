/**
 * ZS-ENG-AI-001 §32.2 Controlled Annex Inventory (Annex A to Annex P)
 * Machine-readable contracts, schemas, risk classes, and validation models
 * governing all AI subsystems in the ZoikoShield Platform.
 */

// ============================================================================
// Core Risk & Classification Enums (§05, §14, §15, §16)
// ============================================================================

export type AiRiskClass =
  | 'AR-0' // Prohibited / Deterministic only
  | 'AR-1' // Assistive Low (formatting, translation, low-risk summary)
  | 'AR-2' // Controlled Advisory (triage support, evidence explanation, suggestions)
  | 'AR-3' // High-Control Agentic (multi-step investigation, bounded tools)
  | 'AR-4' // High-Impact / Restricted (material decision support, privileged access)
  | 'AR-X'; // Prohibited (cross-tenant reasoning, unapproved training)

export type AiAutonomyLevel =
  | 'A0_DETERMINISTIC_ONLY'
  | 'A1_ASSISTIVE'
  | 'A2_RECOMMEND'
  | 'A3_PRE_APPROVED_BOUNDED'
  | 'A4_HIGH_IMPACT_RESTRICTED';

export type AiToolSideEffectClass =
  | 'T0_PURE_READ' // Pure read (no side effects)
  | 'T1_DERIVED_COMPUTATION' // In-memory transformation / simulation
  | 'T2_REVERSIBLE_INTERNAL_WRITE' // Draft note, queue review
  | 'T3_EXTERNAL_COMMUNICATION' // Notification, ticket creation
  | 'T4_CUSTOMER_ESTATE_ACTION' // Revoke token, quarantine host (R0-R4 gated)
  | 'T5_IRREVERSIBLE_PROHIBITED'; // Prohibited to AI (delete evidence, sign claim)

// ============================================================================
// Annex A: AI Use-Case & Impact-Assessment Record (§05, §25, §32.2)
// ============================================================================
export interface AnnexA_AiUseCaseRecord {
  id: string; // e.g. AI-UC-INVESTIGATION-SUMMARY
  version: string;
  name: string;
  owner: string; // e.g. ai-systems
  accountableExecutive: string;
  riskClass: AiRiskClass;
  autonomy: AiAutonomyLevel;
  purpose: string;
  users: string[]; // Allowed roles e.g. ['soc_analyst', 'incident_responder']
  dataClasses: string[]; // e.g. ['security_telemetry', 'case_evidence']
  prohibitedOutcomes: string[]; // e.g. ['incident_declaration', 'case_closure', 'response_approval']
  eligibleModelRoutes: string[];
  humanReviewRequirement:
    'MANDATORY_BEFORE_DISPOSITION' | 'OPTIONAL' | 'PROHIBITED';
  dpiaReferenceId?: string;
  status:
    | 'PROPOSED'
    | 'CLASSIFIED'
    | 'DESIGNING'
    | 'EVALUATING'
    | 'ACTIVE'
    | 'DEGRADED'
    | 'SUSPENDED'
    | 'RETIRED';
  reviewDate: Date;
  expiryDate: Date;
}

// ============================================================================
// Annex B: Model/Provider Approval & Due-Diligence Profile (§08, §24)
// ============================================================================
export interface AnnexB_ModelProviderProfile {
  providerId: string;
  providerName: string;
  approvedRegions: string[];
  contractualDataTerms: {
    trainingAllowed: boolean; // MUST be false
    zeroDataRetentionEnforced: boolean;
    subprocessorsReviewed: boolean;
    incidentNoticeHours: number;
  };
  supportedModels: Array<{
    modelId: string;
    modelAlias: string;
    pinnedVersion: string;
    contextWindowTokens: number;
    maxOutputTokens: number;
    costPerMillionInputTokensUsd: number;
    costPerMillionOutputTokensUsd: number;
    modalities: string[];
    isApproved: boolean;
  }>;
  complianceCertifications: string[]; // SOC 2, ISO 27001, etc.
  concentrationRiskRating: 'LOW' | 'MEDIUM' | 'HIGH';
  approvedBy: string;
  approvedAt: Date;
}

// ============================================================================
// Annex C: Model Route & Fallback Policy (§07, §08)
// ============================================================================
export interface AnnexC_ModelRoutePolicy {
  id: string;
  routeLabel: string;
  eligibleRegions: string[];
  eligibleDataClasses: string[];
  primary: {
    providerId: string;
    modelId: string;
    pinnedVersion: string;
  };
  fallback: {
    mode:
      | 'DETERMINISTIC_BASELINE'
      | 'HUMAN_ONLY'
      | 'FAIL_CLOSED'
      | 'ALTERNATE_MODEL';
    alternateProviderId?: string;
    alternateModelId?: string;
  };
  maxInputTokens: number;
  maxOutputTokens: number;
  timeoutMs: number;
  killState: 'ACTIVE' | 'DEGRADED' | 'KILLED';
}

// ============================================================================
// Annex D: Prompt Profile & Version-Review Template (§10)
// ============================================================================
export interface AnnexD_PromptProfile {
  promptId: string;
  version: number;
  useCaseId: string;
  objective: string;
  instructionPrecedenceOrder: [
    'PLATFORM_SAFETY_POLICY',
    'FEATURE_SYSTEM_PROFILE',
    'TENANT_POLICY_OVERLAY',
    'TASK_CONTEXT',
    'RETRIEVED_CONTENT',
    'USER_INSTRUCTION',
  ];
  outputContract: {
    schemaType: 'JSON_SCHEMA' | 'TYPED_OBJECT';
    mandatoryFields: string[];
    uncertaintyReportingRequired: boolean;
    refusalReasonCodes: string[];
  };
  injectionDefense: {
    treatAllContentAsData: boolean;
    untrustedContentDelimiters: boolean;
  };
  approvedBy: string;
  approvedAt: Date;
}

// ============================================================================
// Annex E: Retrieval Source, Chunking, Embedding & Index Profile (§11, §12)
// ============================================================================
export interface AnnexE_RetrievalProfile {
  sourceId: string;
  sourceAuthority: string;
  licensingRights: string;
  tenantPartitionKeyRequired: boolean;
  embeddingModel: string;
  embeddingDimension: number;
  chunkingPolicy: {
    maxTokensPerChunk: number;
    overlapTokens: number;
    preserveSectionBoundaries: boolean;
  };
  citationValidationRequired: boolean;
  quarantineOnIntegrityFailure: boolean;
}

// ============================================================================
// Annex F: Agent Profile, Autonomy & Budgets (§14)
// ============================================================================
export interface AnnexF_AgentProfile {
  agentId: string;
  principal: string; // e.g. workload://ai/case-investigator
  goal: string;
  autonomy: AiAutonomyLevel;
  allowedTools: string[];
  memoryPolicy: {
    mode: 'EPHEMERAL_SCRATCHPAD_ONLY' | 'CASE_SCOPED' | 'SESSION_SCOPED';
    ttlHours?: number;
  };
  hardBudgets: {
    maxSteps: number; // Hard ceiling <= 12
    maxToolCalls: number; // Hard ceiling <= 20
    maxDurationSeconds: number; // Hard ceiling <= 180
    maxCostUsd: number; // Hard ceiling <= $1.50
  };
  mandatoryCheckpoints: Array<
    | 'BEFORE_EXTERNAL_QUERY'
    | 'BEFORE_HUMAN_RECOMMENDATION'
    | 'BEFORE_SIDE_EFFECT'
  >;
  stopConditions: Array<
    'POLICY_DENIAL' | 'INJECTION_DETECTED' | 'BUDGET_EXHAUSTED' | 'HUMAN_STOP'
  >;
}

// ============================================================================
// Annex G: AI Tool Contract & Side-Effect Classification (§15)
// ============================================================================
export interface AnnexG_ToolContract {
  toolName: string;
  operationType: string;
  sideEffectClass: AiToolSideEffectClass;
  requiredCapabilityScope: string;
  targetServiceAuthorizationEndpoint: string;
  idempotent: boolean;
  compensatingActionType?: string; // For rollbacks
  rateLimitPerMinute: number;
  owner: string;
}

// ============================================================================
// Annex H: Memory Profile & Deletion Controls (§13)
// ============================================================================
export interface AnnexH_MemoryProfile {
  memoryType:
    | 'WORKING'
    | 'SESSION'
    | 'CASE_TASK'
    | 'USER_PREFERENCE'
    | 'ORGANIZATIONAL_KNOWLEDGE';
  isDefaultEnabled: boolean;
  defaultTtlSeconds: number;
  allowedContent: string[];
  prohibitedContent: string[]; // Security facts, risk scores, credentials prohibited
  supportsImmediateUserDeletion: boolean;
  autoExpirePolicy: string;
}

// ============================================================================
// Annex I: Human Oversight & Decision-Rights Matrix (§16)
// ============================================================================
export interface AnnexI_DecisionRightsRow {
  decisionArea: string; // e.g. 'Alert Summarization', 'Incident Declaration'
  aiRole: 'NO_AUTHORITY' | 'ASSIST' | 'RECOMMEND' | 'DRAFT' | 'BOUNDED_ASSIST';
  requiredHumanAuthority: string;
  rationaleRecordingMandatory: boolean;
  overrideMechanismAvailable: boolean;
}

// ============================================================================
// Annex J: Evaluation Plan, Dataset Manifest & Threshold Report (§19)
// ============================================================================
export interface AnnexJ_EvaluationReport {
  useCaseId: string;
  goldDatasetVersion: string;
  totalTestCases: number;
  meanGroundingScore: number; // Threshold >= 0.85
  meanCitationPrecision: number; // Threshold >= 0.90
  zeroToleranceCriticalFailures: number; // MUST be 0
  releaseDecision: 'APPROVED' | 'BLOCKED';
  evaluatedAt: Date;
}

// ============================================================================
// Annex K: Adversarial Test & Independent Red-Team Report (§20)
// ============================================================================
export interface AnnexK_RedTeamReport {
  testSuiteId: string;
  testedConfigurations: string[];
  testedAttackVectors: Array<
    | 'DIRECT_PROMPT_INJECTION'
    | 'INDIRECT_PROMPT_INJECTION'
    | 'CROSS_TENANT_LEAKAGE'
    | 'DENIAL_OF_WALLET'
    | 'EXCESSIVE_AGENCY'
    | 'POISONED_RETRIEVAL'
  >;
  criticalVulnerabilitiesFound: number;
  remediationStatus: 'CLEARED' | 'PENDING_FIX';
  signedByRedTeamLead: string;
}

// ============================================================================
// Annex L: AI Decision-Record & Evidence Schema (§22, §29)
// ============================================================================
export interface AnnexL_AiDecisionRecord {
  requestId: string;
  tenantId: string;
  actorId: string;
  useCaseId: string;
  promptProfileId: string;
  promptVersion: number;
  contextManifestHash: string; // SHA-256
  sources: Array<{
    id: string;
    version: number;
    span: string;
  }>;
  modelRouteId: string;
  outputHash: string; // SHA-256
  validationResults: {
    schemaValid: boolean;
    groundingPassed: boolean;
    citationsVerified: boolean;
  };
  humanDecision?: {
    state: 'ACCEPTED' | 'MODIFIED' | 'REJECTED' | 'ESCALATED';
    actorId: string;
    reason?: string;
  };
  cost: {
    tokensIn: number;
    tokensOut: number;
    amountUsd: number;
  };
  evidenceId: string;
  timestamp: Date;
}

// ============================================================================
// Annex M: AI Monitoring, Drift & Cost Dashboard Specification (§21, §22)
// ============================================================================
export interface AnnexM_MonitoringSpec {
  metricKeys: string[];
  alertThresholds: {
    maxGroundedClaimFailureRate: number;
    maxCriticalFailureCount: number; // 0
    maxCostPerAcceptedOutcomeUsd: number;
    maxLatencyP95Ms: number;
  };
}

// ============================================================================
// Annex N: AI Incident, Kill-Switch & Rollback Runbook (§23)
// ============================================================================
export interface AnnexN_KillSwitchRunbook {
  killScopesSupported: [
    'FEATURE',
    'PROMPT_PROFILE',
    'MODEL_ROUTE',
    'PROVIDER',
    'RETRIEVAL_SOURCE',
    'AGENT',
    'TOOL',
    'TENANT',
    'GLOBAL',
  ];
  dualControlRequired: boolean;
  reconciliationAuditRequired: boolean;
}

// ============================================================================
// Annex O: AI Transparency, Disclosure & Feedback Pattern (§18, §25)
// ============================================================================
export interface AnnexO_DisclosurePattern {
  visualLabel: string; // e.g. "AI-Assisted (Advisory)"
  showCitationDrawer: boolean;
  showMissingEvidenceWarning: boolean;
  userCorrectionPathEnabled: boolean;
}

// ============================================================================
// Annex P: AI Release Gate & Production-Approval Checklist (§30, §32)
// ============================================================================
export interface AnnexP_ReleaseChecklist {
  gateLevel: 'G0_BUILD_AUTH' | 'G1_DESIGN_PARTNER' | 'G2_COMMERCIAL_GA';
  items: Array<{
    code: string;
    description: string;
    verified: boolean;
    evidenceRef: string;
  }>;
  signOffAuthorities: Array<{
    role: string;
    signee: string;
    signedAt: Date;
  }>;
}
