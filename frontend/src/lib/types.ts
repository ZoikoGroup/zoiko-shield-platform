export type ConnectorProviderType =
  | 'generic-webhook'
  | 'generic-syslog'
  | 'microsoft-entra'
  | 'okta-identity'
  | 'aws-cloudtrail'
  | 'aws-guardduty'
  | 'azure-monitor'
  | 'gcp-scc'
  | 'crowdstrike-edr'
  | 'sentinelone-edr'
  | 'palo-alto-cortex-xdr'
  | 'microsoft-defender-edr'
  | 'snyk-vulnerability'
  | 'jira-ticketing';

export type ControlFrameworkType =
  | 'SOC2_TYPE2'
  | 'ISO27001_2022'
  | 'DORA'
  | 'NIS2'
  | 'PCI_DSS';

export type ConnectorCertificationTier =
  | 'P0_CERTIFIED'
  | 'P1_PREVIEW'
  | 'EXPERIMENTAL_UNCERTIFIED';

export type CommercialOfferType =
  | 'MANAGED_DEFENSE'
  | 'CONTINUOUS_ASSURANCE'
  | 'INCIDENT_RESPONSE_RETAINER'
  | 'EXPOSURE_MANAGEMENT'
  | 'AI_SECURITY';

export interface Tenant {
  id: string;
  orderId?: string;
  organizationName: string;
  slug: string;
  legalEntityName: string;
  planTier?: 'STANDARD' | 'PROFESSIONAL' | 'ENTERPRISE' | 'ENTERPRISE_PREMIUM';
  activeOffers?: CommercialOfferType[];
  isEnterprisePlus?: boolean;
  legalEntity?: {
    legalName: string;
    registrationNumber?: string;
    countryOfRegistration?: string;
    registeredAddress?: string;
  };
  environmentName: string;
  environment?: {
    name?: string;
    environmentType?: 'PRODUCTION' | 'STAGING';
  };
  homeRegion: string;
  dataResidencyRegion?: string;
  timezone?: string;
  dataClass?: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
  retentionPolicyRef?: string;
  ownerEmail?: string;
  accessDisclosureVersion?: string;
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
  createdAt: string;
}

export interface UserSession {
  userId: string;
  email: string;
  fullName: string;
  role: 'TENANT_OWNER' | 'SECURITY_ANALYST' | 'SUPER_ADMIN' | 'AUDITOR';
  tenantId: string;
  environment: string;
  token?: string;
  isAuthenticated: boolean;
}

export interface TeamMember {
  id: string;
  email: string;
  fullName: string;
  role: 'TENANT_OWNER' | 'SECURITY_ANALYST' | 'SUPER_ADMIN' | 'AUDITOR';
  status: 'ACTIVE' | 'INVITED' | 'DISABLED';
  joinedAt: string;
}

export interface Invitation {
  id: string;
  tenantId: string;
  invitedEmail: string;
  assignedRole: 'SECURITY_ANALYST' | 'AUDITOR' | 'TENANT_ADMIN';
  token: string;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED';
  expiresAt?: string;
  createdAt: string;
}

export interface Connector {
  id: string;
  tenantId: string;
  name: string;
  provider: ConnectorProviderType;
  sourceRegion: string;
  environmentId?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'TESTING' | 'DISABLED';
  healthStatus: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  hmacSecret: string;
  webhookUrl: string;
  eventsIngestedCount: number;
  lastEventAt?: string;
  tier?: ConnectorCertificationTier;
  isP1PreviewEnabled?: boolean;
  ocsfStatus?: 'MAPPED_OCSF_V1' | 'SCHEMA_CUSTOM' | 'PENDING_MAPPING';
  eventsPerMinute?: number;
}

export interface RawTelemetryEvent {
  eventId: string;
  eventType: string;
  occurredAt: string;
  user?: { id?: string; email?: string };
  sourceIp: string;
  result: 'SUCCESS' | 'FAILED' | 'BLOCKED';
  metadata?: Record<string, unknown>;
}

export interface TelemetryNormalized {
  id: string;
  tenantId: string;
  environmentId: string;
  connectorId: string;
  eventClass: 'AUTHENTICATION' | 'EDR_PROCESS' | 'CLOUD_IAM' | 'NETWORK';
  eventCategory: 'IDENTITY' | 'ENDPOINT' | 'INFRASTRUCTURE';
  eventActivity: 'LOGIN_ATTEMPT' | 'PROCESS_SPAWN' | 'POLICY_ATTACH' | 'EGRESS_CONNECT';
  severity: 'INFORMATIONAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  actorUserId?: string;
  actorEmail?: string;
  sourceIp: string;
  action: string;
  outcome: 'SUCCESS' | 'FAILED' | 'BLOCKED';
  occurredAt: string;
  normalizationStatus: 'NORMALIZED';
  rawPayloadHash: string;
}

export interface Alert {
  id: string;
  alertId?: string;
  tenantId: string;
  detectionRuleId: string;
  detectionRuleVersion?: number;
  ruleName?: string;
  title: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  priority: 'P1' | 'P2' | 'P3';
  status: 'NEW' | 'ACKNOWLEDGED' | 'TRIAGED' | 'ESCALATED' | 'CASE_CREATED' | 'DISMISSED' | 'CLOSED';
  sourceConnector?: string;
  assignee?: string;
  sourceEventIds: string[];
  affectedAssets: string[];
  affectedIdentities: string[];
  mitreTechnique?: string;
  createdAt: string;
}

export interface TimelineEntry {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  actor: string;
  type: 'ALERT_TRIGGERED' | 'CASE_OPENED' | 'EVIDENCE_RECORDED' | 'AI_INVESTIGATED' | 'DECISION_RECORDED' | 'RESPONSE_SIMULATED' | 'CONTAINMENT_EXECUTED';
  metadata?: Record<string, unknown>;
}

export interface EvidenceRecord {
  id: string;
  tenantId: string;
  caseId: string;
  evidenceType: 'SECURITY_TELEMETRY' | 'AUTH_LOG' | 'EDR_SNAPSHOT' | 'IAM_DIFF';
  sourceType: 'WEBHOOK' | 'SENTINELONE' | 'OKTA' | 'ENTRA' | 'CLOUDTRAIL';
  collectorId: string;
  collectorMeta?: Record<string, unknown>;
  contentHash: string;
  sha256Hash?: string;
  freshnessStatus: 'CURRENT' | 'HISTORICAL';
  integrityStatus: 'VALID' | 'TAMPERED';
  anchorStatus?: 'ANCHORED' | 'PENDING';
  epoch?: number;
  merkleEpoch?: number;
  merkleRootHash?: string;
  recordedAt: string;
  rawPayload?: unknown;
}

export interface AiCitation {
  evidenceId: string;
  evidenceRef: string;
  description: string;
}

export interface AiInvestigationSummary {
  outputId?: string;
  aiRunId: string;
  caseId: string;
  status: 'REVIEW_REQUIRED' | 'ACCEPTED' | 'REJECTED';
  generatedAt: string;
  modelArmorVerdict: 'SCREENED_SAFE' | 'FLAGGED';
  executiveSummary: string;
  summaryText?: string;
  threatAssessment: string;
  citations: AiCitation[];
  hypotheses: Array<{
    id: string;
    title: string;
    likelihood: 'HIGH' | 'MEDIUM' | 'LOW';
    supportingEvidence: string[];
  }>;
  recommendedActions: string[];
  limitations: string[];
  rationale?: string;
  modifiedContent?: string;
}

export interface HumanDecision {
  id: string;
  tenantId: string;
  caseId: string;
  outcome?: 'CONFIRMED_INCIDENT' | 'FALSE_POSITIVE' | 'NEEDS_MORE_INFO';
  decisionType: 'INCIDENT_DECLARATION' | 'CONFIRMED_INCIDENT' | 'BENIGN_ANOMALY' | 'FALSE_POSITIVE' | 'NEEDS_MORE_INFO' | 'ESCALATE_TIER_2';
  decisionNotes: string;
  analystNotes?: string;
  actorId: string;
  actorName: string;
  evidenceIds: string[];
  timestamp: string;
}

export interface ResponseProposal {
  id: string;
  tenantId: string;
  caseId: string;
  actionType: 'RESET_USER_SESSIONS' | 'ISOLATE_EDR_HOST' | 'BLOCK_EGRESS_FIREWALL' | 'REVOKE_IAM_ROLE';
  targetAsset: string;
  authorityLevel: 'R1_RECOMMEND' | 'R2_APPROVAL_REQUIRED' | 'R3_EMERGENCY_AUTONOMOUS';
  status: 'PROPOSED' | 'SIMULATED' | 'APPROVED' | 'EXECUTED' | 'REJECTED';
  proposedAt: string;
  simulatedAt?: string;
  blastRadiusScore?: number;
}

export interface SimulationReceipt {
  id: string;
  proposalId: string;
  commandId: string;
  result: 'SIMULATED' | 'FAILED';
  simulatedBlastRadius: number;
  simulatedAt: string;
  stateDiffs: Array<{
    target: string;
    beforeState: string;
    afterState: string;
    rollbackCommand: string;
  }>;
  observedEffect: Record<string, unknown>;
  safetyAttestationHash: string;
}

export interface Case {
  id: string;
  tenantId: string;
  title: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'INVESTIGATING' | 'CONTAINED' | 'RESOLVED' | 'CLOSED';
  ownerId: string;
  ownerName: string;
  createdAt: string;
  updatedAt: string;
  linkedAlertIds: string[];
  timeline: TimelineEntry[];
  evidenceList: EvidenceRecord[];
  aiSummary?: AiInvestigationSummary;
  aiReviewEnvelope?: AiReviewEnvelope;
  decision?: HumanDecision;
  responseProposal?: ResponseProposal;
  simulationReceipt?: SimulationReceipt;
}

export interface AttackPathNode {
  nodeId: string;
  stepNumber?: number;
  label: string;
  role: 'ENTRYPOINT' | 'PIVOT' | 'CROWN_JEWEL' | 'CONTAINMENT_TARGET';
  mitreTechnique: string;
  techniqueName?: string;
  targetEntity?: string;
  evidenceDigest?: string;
  description: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  riskScore?: number;
  status?: 'DETECTED' | 'CORRELATED' | 'CONTAINED';
  sourceIp?: string;
  account?: string;
}

export interface AttackPathTrajectory {
  pathId: string;
  caseId: string;
  alertId?: string;
  title: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  totalHops?: number;
  nodes: AttackPathNode[];
  blastRadius: {
    targetHost: string;
    affectedAccounts?: number;
    affectedConnections?: number;
    projectedDowntimeSec: number;
    isolationMechanism: string;
    containmentSafetyVerdict?: 'SAFE_TO_EXECUTE' | 'REQUIRES_SUPER_ADMIN_ESCALATION';
  };
  generatedAt: string;
}

export interface ControlTest {
  id: string;
  controlId: string;
  framework: ControlFrameworkType;
  controlName: string;
  description: string;
  category: 'IDENTITY_ACCESS' | 'CONTINUOUS_AUDIT' | 'INCIDENT_RESPONSE' | 'CRYPTOGRAPHY' | 'NETWORK_ISOLATION';
  result: 'PASS' | 'FAIL' | 'PENDING';
  evaluatedEventsCount: number;
  lastEvaluatedAt?: string;
  evidenceSampleHash?: string;
}

export interface AuditPackage {
  id: string;
  tenantId: string;
  packageName: string;
  packageHash: string;
  dilithiumSignature: string;
  ecdsaP256Signature?: string;
  ed25519Signature?: string;
  status: 'GENERATED' | 'VERIFIED' | 'EXPORTED';
  generatedAt: string;
  sizeBytes: number;
  manifest: {
    evidenceCount: number;
    casesCount: number;
    controlEvaluationsCount: number;
    epochMerkleRoot: string;
    tsaTimestampProof: string;
  };
}

export interface JitElevationSession {
  sessionId: string;
  operatorId: string;
  targetTenantId: string;
  elevatedRole: string;
  status: 'PENDING' | 'APPROVED' | 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  clientIp: string;
  statedPurpose: string;
  issuedAt: string;
  expiresAt: string;
  hardwareStepUpVerified: boolean;
  hardwareProofDigest?: string;
  peerApprover?: string;
  revocationReason?: string;
}

export interface HsmCustodyReceipt {
  receiptId: string;
  keyId: string;
  provider: 'GOOGLE_CLOUD_KMS' | 'AWS_KMS' | 'VAULT_HSM' | 'CLOUD_HSM';
  fipsLevel: 'FIPS_140_3_L3' | 'FIPS_140_2_L3' | 'NOT_VALIDATED';
  algorithm: 'ECDSA_P256_ML_DSA_65' | 'PQC_DILITHIUM3' | 'ECDSA_P256';
  status: 'VALID' | 'REVOKED';
  verifiedAt: string;
}


// ----------------------------------------------------------------------------
// AI Safety Incident Lifecycle (§23), Drift Monitoring (§21), Supply Chain (§24)
// ----------------------------------------------------------------------------

export type AiIncidentSeverity = 'SEV1_CRITICAL' | 'SEV2_HIGH' | 'SEV3_MEDIUM' | 'SEV4_LOW';
export type AiIncidentState =
  | 'DECLARED'
  | 'CONTAINED_KILL_SWITCH'
  | 'FALLBACK_ACTIVE'
  | 'ROOT_CAUSE_ANALYZED'
  | 'RESOLVED'
  | 'CLOSED';

export type AiIncidentTrigger =
  | 'PROMPT_INJECTION'
  | 'MODEL_HALLUCINATION'
  | 'MODEL_DRIFT_CRITICAL'
  | 'DATA_LEAKAGE'
  | 'TOOL_MISUSE'
  | 'OPERATOR_MANUAL';

export interface AiIncident {
  id: string;
  tenantId: string;
  title: string;
  severity: AiIncidentSeverity;
  state: AiIncidentState;
  trigger: AiIncidentTrigger;
  affectedModel: string;
  killSwitchEngaged: boolean;
  fallbackModeActive: boolean;
  rootCauseSummary?: string;
  declaredBy: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface ModelDriftReport {
  modelId: string;
  status: 'STABLE' | 'WARNING_DRIFT_DETECTED' | 'CRITICAL_DRIFT_DETECTED';
  populationStabilityIndex: number;
  tokenLengthPsi: number;
  confidenceShiftPct: number;
  evaluatedAt: string;
}

export interface AiSupplyChainReport {
  hhiIndex: number;
  concentrationLevel: 'LOW' | 'MODERATE' | 'HIGH_CONCENTRATION';
  primaryProvider: string;
  providerShares: Record<string, number>;
  allTier1FallbackReady: boolean;
}

export interface ComplianceDriftState {
  tenantId: string;
  status: 'COMPLIANT' | 'WARNING_DRIFT' | 'CRITICAL_DRIFT';
  score: number;
  lastAssessedAt: string;
  slaAlarms: Array<{
    alarmId: string;
    controlId: string;
    severity: 'WARNING' | 'CRITICAL';
    reason: string;
    triggeredAt: string;
  }>;
}

export type EuAiActRiskTier = 'MINIMAL_RISK' | 'LIMITED_RISK' | 'HIGH_RISK' | 'UNACCEPTABLE_RISK';
export type NistAiRmfFunction = 'GOVERN' | 'MAP' | 'MEASURE' | 'MANAGE';
export type AiLifecycleState = 'PROPOSED' | 'EVALUATING' | 'APPROVED_FOR_PRODUCTION' | 'DECOMMISSIONED';

export interface AiModelProfile {
  modelId: string;
  provider: 'Google' | 'Anthropic' | 'OpenAI' | 'Local' | string;
  modelFamily: string;
  version: string;
  euAiActClassification: EuAiActRiskTier;
  nistRmfAlignment: NistAiRmfFunction[];
  purpose: string;
  primaryUseCaseKeys: string[];
  deterministicFallbackEngine: string;
  hhiWeight: number;
  humanOversightRequired: boolean;
  lifecycleState?: AiLifecycleState;
  registeredAt?: string;
  updatedAt?: string;
}

export interface AiSystemInventorySummary {
  inventoryVersion: string;
  totalRegisteredModels: number;
  models: AiModelProfile[];
  highRiskUseCasesCount: number;
  providerConcentrationHhi: number;
  governanceComplianceStatus: 'COMPLIANT_NIST_EU_AI_ACT' | 'NON_COMPLIANT';
  assessedAt: string;
}

// ----------------------------------------------------------------------------
// WebAuthn / Passkeys (identity-adapter auth.controller passkeys/* routes)
// ----------------------------------------------------------------------------

export interface RegisteredPasskey {
  id: string;
  credentialId: string;
  label: string | null;
  transports: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface ExperienceStateEnvelope<T> {
  status:
    | 'LOADING'
    | 'PARTIAL'
    | 'STALE'
    | 'DEGRADED'
    | 'UNAUTHORIZED'
    | 'UNAVAILABLE'
    | 'RECOVERY_IN_PROGRESS'
    | 'HEALTHY_SYNCED';
  data?: T;
  isPartial: boolean;
  isStale: boolean;
  staleGracePeriodSeconds?: number;
  degradedReason?: string;
  lastSyncedAt: string;
  correlationId: string;
  tenantId: string;
}

// ----------------------------------------------------------------------------
// 10-Field Mandatory Review Envelope per Spec §16.1
// ----------------------------------------------------------------------------

export type DecisionState = 'UNREVIEWED' | 'ACCEPTED' | 'MODIFIED' | 'REJECTED' | 'ESCALATED' | 'PENDING_REVIEW';
export type DecisionTransition = 'ACCEPT' | 'MODIFY' | 'REJECT' | 'ESCALATE';
export type ResponseAuthorityTier = 'R0' | 'R1' | 'R2' | 'R3' | 'R4';
export type QualitativeConfidenceBand = 'HIGH' | 'MEDIUM' | 'LOW';

export interface AiLabelAndUseCase {
  aiLabel?: string;
  useCaseName: string;
  modelRoute?: string;
  version?: string;
  modelIdentifier?: string;
  providerProfile?: string;
  riskTier?: string;
}

export interface DecisionSourceSpan {
  sourceId: string;
  sourceType: string;
  version?: number;
  exactSpan?: string;
  span?: string;
  name?: string;
  type?: string;
  documentRef?: string;
  confidence?: number;
  confidenceScore?: number;
}

export interface EvidenceCompletenessState {
  missingEvidence?: string[];
  staleEvidence?: string[];
  conflictingEvidence?: string[];
  missingEvidenceCount?: number;
  staleEvidenceCount?: number;
  conflictingEvidenceCount?: number;
  freshnessSeconds?: number;
  completenessRatio?: number;
}

export interface CalibratedConfidence {
  score: number;
  qualitativeBand?: QualitativeConfidenceBand;
  confidenceTier?: QualitativeConfidenceBand;
  calibrationBasis: string;
  uncertaintyFactors: string[];
}

export interface AlternativeHypothesisOrAction {
  actionId?: string;
  title: string;
  rationale: string;
  tradeOffs?: string;
  tradeOff?: string;
}

export interface ExpectedImpactAndReversibility {
  blastRadius: string;
  isReversible?: boolean;
  reversibilityTier?: ResponseAuthorityTier;
  compensationPlan?: string;
  downtimeExpected?: boolean;
  reversibility?: string;
  compensationMechanism?: string;
}

export interface RequiredAuthorityAndApprovals {
  requiredRole?: string;
  responseAuthorityTier?: ResponseAuthorityTier;
  requiredAuthorityTier?: ResponseAuthorityTier;
  dualApproverRequired?: boolean;
  dualCustodyRequired?: boolean;
  approverRoles?: string[];
}

export interface DecisionControls {
  availableTransitions: DecisionTransition[];
  state?: DecisionState;
  currentState?: DecisionState;
}

export interface RecordedHumanDecision {
  decidedBy?: string;
  decision?: DecisionTransition;
  rationale?: string;
  modifiedContent?: string;
  decidedAt?: string;
  escalatedToRole?: string;
  evidenceRef?: string;
  signature?: string;
}

export interface AppealOrFeedbackRoute {
  appealUrl: string;
  feedbackChannel: string;
  customerAffecting: boolean;
}

export interface AiReviewEnvelope<T = any> {
  envelopeId: string;
  tenantId: string;
  environmentId: string;
  createdAt: string;
  aiLabelAndUseCaseName: AiLabelAndUseCase;
  sourcesAndSpans: DecisionSourceSpan[];
  knownMissingStaleOrConflictingEvidence: EvidenceCompletenessState;
  calibratedConfidenceAndUncertainty: CalibratedConfidence;
  alternativeHypothesesOrActions: AlternativeHypothesisOrAction[];
  expectedImpactAndReversibility: ExpectedImpactAndReversibility;
  requiredAuthorityAndApprovals: RequiredAuthorityAndApprovals;
  controls: DecisionControls;
  humanDecisionAndRationale: RecordedHumanDecision;
  appealOrFeedbackRoute: AppealOrFeedbackRoute;
  payload?: T;
}

export interface IncidentResponseRetainer {
  id: string;
  tenantId: string;
  environmentId: string;
  contractId: string;
  serviceObligationId: string;
  priceBookId: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
  termStart: string;
  termEnd: string;
  includedHours: number;
  consumedHours?: number;
  remainingHours?: number;
  includedServices: string[];
  responseWindow: {
    coverage: string;
    acknowledgementTargetMinutes: number;
    activationResponseMinutes: number;
  };
  readinessObligations: {
    namedContacts?: { required: boolean; contacts?: string[] };
    accessProvisioning?: { required: boolean; status?: string };
    evidencePreservation?: { required: boolean };
    escalationPath?: { required: boolean; path?: string };
  };
  exclusions: string[];
  maximumResponseAuthority: 'R0' | 'R1' | 'R2' | 'R3' | 'R4';
  overagePolicy: 'BLOCK' | 'REQUIRE_APPROVAL' | 'ALLOW_CAPPED';
  overageCapHours?: number;
  overageRate?: number;
  warningThresholdPercent: number;
  rolloverPolicy: 'NONE' | 'CAPPED' | 'FULL';
  rolloverCapHours?: number;
  namedActivationPath?: Record<string, unknown>;
  emergencyProvision?: {
    enabled: boolean;
    contractReference?: string;
    reconciliationRequired?: boolean;
  };
  thirdPartyCostPolicy?: {
    enabled: boolean;
    contractReference?: string;
    maxMarkupPercent?: number;
    requiresNamedApproval?: boolean;
  };
  legalServiceScope?: {
    included: boolean;
    counselControlled: boolean;
    contractReference?: string;
  };
  createdAt: string;
}

export interface IncidentWorkOrder {
  id: string;
  tenantId: string;
  environmentId: string;
  retainerId: string;
  incidentReference: string;
  activationReason: string;
  activationReference: string;
  status: 'ACTIVE' | 'PENDING_RECONCILIATION' | 'CLOSED';
  responseAuthority: 'R0' | 'R1' | 'R2' | 'R3' | 'R4';
  includedHours: number;
  consumedHours: number;
  remainingHours: number;
  overageHours: number;
  forecastHours: number;
  warningThresholdPercent: number;
  overagePolicy: 'BLOCK' | 'REQUIRE_APPROVAL' | 'ALLOW_CAPPED';
  overageCapHours?: number;
  evidenceRefs: string[];
  thirdPartyCosts: number;
  emergencyReconciliationStatus: 'NOT_REQUIRED' | 'PENDING' | 'RECONCILED';
  customerContact?: string;
  closureSummary?: string;
  createdAt: string;
  closedAt?: string;
}

export interface WorkOrderConsumptionRecord {
  id: string;
  workOrderId: string;
  tenantId: string;
  hours: number;
  workDescription: string;
  evidenceReference: string;
  loggedBy: string;
  occurredAt: string;
  createdAt: string;
}

export interface IncidentLegalSensitiveRecord {
  id: string;
  workOrderId: string;
  tenantId: string;
  environmentId: string;
  purpose: 'LEGAL_DEFENSE' | 'REGULATOR_INQUIRY' | 'INSURER_PROOF' | 'BREACH_NOTIFICATION' | 'INCIDENT_COORDINATION';
  privilegeStatus: 'COUNSEL_ASSERTED' | 'NO_PRIVILEGE_CLAIMED' | 'UNDER_REVIEW';
  notificationStatus: 'COUNSEL_DETERMINED' | 'STATUTORY_MANDATED' | 'NOT_APPLICABLE';
  counselControlled: boolean;
  separateLegalServiceRef?: string;
  counselActorRef?: string;
  conclusionReference?: string;
  contentReference: string;
  accessReason: string;
  noLegalAdviceWording: string;
  recordedBy: string;
  createdAt: string;
}

export interface IncidentLegalAccessEvent {
  id: string;
  recordId: string;
  workOrderId: string;
  tenantId: string;
  accessorId: string;
  accessorName: string;
  accessReason: string;
  purpose: 'LEGAL_DEFENSE' | 'REGULATOR_INQUIRY' | 'INSURER_PROOF' | 'BREACH_NOTIFICATION' | 'INCIDENT_COORDINATION';
  timestamp: string;
  ipAddress?: string;
}

export interface MerkleEpochCheckpoint {
  epochNumber: number;
  merkleRoot: string;
  leafCount: number;
  pqcSignature: string;
  ecdsaSignature: string;
  witnessCount: number;
  sealedAt: string;
  hsmKeyCustody?: {
    keyId: string;
    provider: string;
    fipsLevel: string;
    algorithm: string;
    timestamp: string;
  };
  leaves?: Array<{
    index: number;
    evidenceId: string;
    eventType: string;
    payloadDigest: string;
    leafHash: string;
  }>;
}

export interface MerkleInclusionProof {
  leafHash: string;
  leafIndex: number;
  auditPath: Array<{ position: 'left' | 'right'; hash: string }>;
  merkleRoot: string;
  epochNumber: number;
}

export interface MerkleVerificationResult {
  valid: boolean;
  epochNumber: number;
  verifiedAt: string;
}

// --- Commercial Catalogue & Capability Governance Types ---

export type GovernanceStatus = 'CORE' | 'CONTROLLED' | 'GATED' | 'DEFERRED';

export interface PublicServiceDefinition {
  serviceId: string;
  serviceName: string;
  category: string;
  publicOutcomeDescription: string;
  status: GovernanceStatus;
  substantiatingComponents: string[];
  includedCapabilities: string[];
  pricingTierMinimum: 'ESSENTIAL' | 'PROFESSIONAL' | 'ADVANCED' | 'ENTERPRISE';
}

export interface CapabilityItem {
  id: string;
  name: string;
  domain: string;
  customerService: string;
  status: GovernanceStatus;
  substantiatingSatellites: string[];
  governanceRationale: string;
  statutoryReference?: string;
  requiresQuorum?: boolean;
  requiresPurposeBoundAccess?: boolean;
}

export interface CapabilityDomainSummary {
  domainId: string;
  domainName: string;
  description: string;
  totalCapabilities: number;
  coreCount: number;
  controlledCount: number;
  gatedCount: number;
  deferredCount: number;
  items: CapabilityItem[];
}

export type PlanTierKey =
  | 'SHIELD_ESSENTIAL'
  | 'SHIELD_PROFESSIONAL'
  | 'SHIELD_ADVANCED'
  | 'SHIELD_ENTERPRISE';

export interface PlanTierPricing {
  monthlyUsd: number | null;
  annualBilledMonthlyUsd: number | null;
  isContractOnly: boolean;
  currency: 'USD' | 'EUR' | 'GBP';
}

export interface PlanTierAllocations {
  maxProtectedAssets: number | null;
  includedTelemetryGbPerDay: number | null;
  // Null until ADR-07 approves contractual SLAs.
  incidentResponseSlaHours: number | null;
  retentionDays: number;
  includedRetainerHoursPerYear: number;
}

export interface PlanTier {
  key: PlanTierKey;
  displayName: string;
  tagline: string;
  description: string;
  pricing: PlanTierPricing;
  allocations: PlanTierAllocations;
  includedOffers: string[];
  highlightedFeatures: string[];
  governanceFeatures: string[];
  supportModel: string;
  isPopular?: boolean;
}

export interface PlanRecommendation {
  recommendedPlan: PlanTier;
  rationale: string[];
  alternativePlans: PlanTier[];
}

export interface MdrServiceObligation {
  id: string;
  contractId: string;
  tenantId: string;
  coverageTier: 'BUSINESS_HOURS_8X5' | 'EXTENDED_16X7' | 'CONTINUOUS_24X7';
  readinessStatus: 'OPERATIONALLY_PROVEN' | 'CONTINGENT' | 'UNPROVEN';
  staffingSchedule: {
    coverageTier: string;
    primaryTimezone: string;
    minimumActiveAnalystsOnDuty: number;
    escalationLeadAvailable: boolean;
    tier3IncidentCommanderOnCall: boolean;
    shiftHandoffProtocolProven: boolean;
  };
  slaWindows: Array<{
    severity: string;
    targetAcknowledgementMinutes: number;
    targetInvestigationMinutes: number;
    targetContainmentMinutes: number;
    financialCreditPercentage: number;
  }>;
  escalationPath: Array<{
    tierLevel: number;
    roleTitle: string;
    responseWindowMinutes: number;
    notificationChannels: string[];
    requiresQuorumApproval: boolean;
  }>;
  operationalProofReference?: string;
  lastReadinessAuditDate?: string;
  verifiedBy?: string;
}

export interface GTMChecklistItem {
  ruleCode: string;
  title: string;
  domain: string;
  ruleStatement: string;
  status: 'VERIFIED' | 'GATED_ENFORCED' | 'DEFERRED_ENFORCED';
  verificationSource: string;
  verifiedAt: string;
  auditPass: boolean;
}

// --- Spec §31: Explicit Service-Health and Readiness States ---

export type ServiceReadinessState =
  | 'HEALTHY'
  | 'AT_RISK'
  | 'DEGRADED'
  | 'PARTIAL_INCOMPLETE'
  | 'STALE'
  | 'UNKNOWN'
  | 'UNAVAILABLE'
  | 'UNAUTHORIZED'
  | 'QUARANTINED'
  | 'MAINTENANCE'
  | 'RECOVERING'
  | 'RECONCILIATION_REQUIRED'
  | 'ERROR_BUDGET_EXHAUSTED'
  | 'READINESS_CONDITIONAL'
  | 'NOT_READY'
  | 'WITHDRAWN';

export interface ServiceDependencyStatus {
  dependencyName: string;
  type: 'DATABASE' | 'MESSAGE_BROKER' | 'KMS_HSM' | 'EXTERNAL_API' | 'INTERNAL_SERVICE';
  healthy: boolean;
  latencyMs: number;
  lastChecked: string;
  details?: string;
}

export interface ServiceHealthSignal {
  signalKey: string;
  label: string;
  value: string | number | boolean;
  threshold?: string | number;
  status: 'OPTIMAL' | 'WARNING' | 'CRITICAL';
}

export interface CoreServiceReadiness {
  serviceId: string;
  serviceName: string;
  displayName: string;
  description: string;
  version: string;
  state: ServiceReadinessState;
  stateMeaning: string;
  readinessScore: number;
  lastAssessedAt: string;
  dependencies: ServiceDependencyStatus[];
  signals: ServiceHealthSignal[];
  blockers: string[];
  operationalConditions?: string[];
}

export interface PlatformReadinessSnapshot {
  snapshotId: string;
  evaluatedAt: string;
  overallState: ServiceReadinessState;
  overallScore: number;
  totalServicesCount: number;
  healthyServicesCount: number;
  conditionalServicesCount: number;
  degradedServicesCount: number;
  g1GateRatified: boolean;
  activeBlockersCount: number;
  services: Record<string, CoreServiceReadiness>;
  auditAttestationHash: string;
}

export type DataStoreId =
  | 'shield_core_db'
  | 'merkle_ledger'
  | 'timeseries_telemetry'
  | 'audit_vault';

export type RpoStatus = 'COMPLIANT' | 'WARNING' | 'BREACHED';
export type RestoreVerificationStatus = 'VERIFIED' | 'FAILED' | 'UNVERIFIED' | 'STALE';

export interface DataStoreBackupRecord {
  storeId: DataStoreId;
  displayName: string;
  storeType: 'RELATIONAL_POSTGRES' | 'IMMUTABLE_MERKLE_TREE' | 'TIMESERIES_ANALYTICS' | 'COMPLIANCE_VAULT';
  lastBackupCompletedAt: string;
  backupAgeHours: number;
  backupSizeBytes: number;
  rpoTargetMinutes: number;
  rpoStatus: RpoStatus;
  encryptionAlgorithm: 'AES_256_GCM' | 'KMS_ENVELOPE_AES256' | 'NONE';
  encryptionVerified: boolean;
  immutabilityLocked: boolean;
  retentionDays: number;
  manifestChecksumSha256: string;
  lastRestoreDrillAt: string;
  lastRestoreDrillStatus: RestoreVerificationStatus;
  restoreDrillAgeDays: number;
}

export interface DisasterRecoveryPostureSummary {
  assessedAt: string;
  overallBackupHealth: 'HEALTHY' | 'AT_RISK' | 'DEGRADED';
  overallRpoCompliant: boolean;
  overallRestoreVerified: boolean;
  activeStoresCount: number;
  healthyStoresCount: number;
  staleBackupsCount: number;
  unverifiedRestoresCount: number;
  rtoTargetHours: number;
  stores: Record<DataStoreId, DataStoreBackupRecord>;
  attestationDigest: string;
}

export interface TableReconciliationRecord {
  tableName: string;
  sourceRowCount: number;
  restoredRowCount: number;
  rowDriftCount: number;
  checksumMatches: boolean;
  foreignKeysValid: boolean;
}

export interface RestoreDrillReceipt {
  drillId: string;
  storeId: DataStoreId;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  durationSeconds: number;
  rtoTargetSeconds: number;
  rtoCompliant: boolean;
  status: RestoreVerificationStatus;
  scratchSchemaName: string;
  scratchSchemaTornDown: boolean;
  totalTablesReconciled: number;
  totalRowsReconciled: number;
  sourceMerkleHead: string;
  restoredMerkleHead: string;
  merkleHeadAligned: boolean;
  tableReconciliations: TableReconciliationRecord[];
  discrepancies: string[];
  receiptSignatureSha256: string;
}



