export type ConnectorProviderType =
  | 'generic-webhook'
  | 'generic-syslog'
  | 'microsoft-entra'
  | 'aws-cloudtrail'
  | 'azure-monitor'
  | 'crowdstrike-edr';

export type ControlFrameworkType =
  | 'SOC2_TYPE2'
  | 'ISO27001_2022'
  | 'DORA'
  | 'NIS2'
  | 'HIPAA';

export interface Tenant {
  id: string;
  orderId?: string;
  organizationName: string;
  slug: string;
  legalEntityName: string;
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
  decision?: HumanDecision;
  responseProposal?: ResponseProposal;
  simulationReceipt?: SimulationReceipt;
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
  ed25519Signature: string;
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
  peerApprover?: string;
  revocationReason?: string;
}

export interface EnclaveAttestationReceipt {
  receiptId: string;
  enclaveId: string;
  platform: 'AWS_NITRO' | 'GCP_CONFIDENTIAL' | 'INTEL_SGX';
  pcr0: string;
  eatId: string;
  status: 'VALID' | 'TAMPERED';
  verifiedAt: string;
}
