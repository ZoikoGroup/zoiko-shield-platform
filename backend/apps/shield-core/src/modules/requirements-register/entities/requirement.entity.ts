/**
 * Controlled Engineering Specification §07: Requirements & Traceability Metadata Schema (R04)
 *
 * "Build the current ZoikoShield release only from requirements that are controlled, current,
 * assigned, measurable and traceable. Every material behavior must identify its tenant and
 * data scope, authority, failure behavior, AI status, evidence obligation, acceptance criteria,
 * verification method and release evidence."
 */

export type TenantScope = 'SINGLE_TENANT' | 'MULTI_TENANT' | 'SOVEREIGN_CELL' | 'GLOBAL_SYSTEM';

export type DataScope =
  | 'PUBLIC'
  | 'INTERNAL_COMMERCIAL'
  | 'CONFIDENTIAL_CUSTOMER_TELEMETRY'
  | 'RESTRICTED_PHI_PII'
  | 'LEGAL_PRIVILEGED_EVIDENCE'
  | 'CRYPTOGRAPHIC_KEY_MATERIAL';

export type AuthorityType =
  | 'LAW_REGULATION'      // e.g. GDPR, HIPAA, NIS2, DORA
  | 'CONTROLLED_SPEC'     // e.g. Spec §05, §07, §12, §16.1, §21, §24
  | 'ADR'                 // e.g. ADR-001, ADR-002, ADR-008
  | 'COMMERCIAL_CONTRACT' // e.g. SLA Terms, Plan Entitlement Ladder
  | 'SECURITY_STANDARD';  // e.g. SOC 2 Type II, ISO 27001, NIST SP 800-207

export type FailureBehavior =
  | 'FAIL_CLOSED'          // Default for Security/Auth: Deny access, freeze state
  | 'DEGRADE_DETERMINISTIC'// Default for AI: Safe heuristic fallback with zero LLM dependence
  | 'ALERT_AND_CONTINUE'   // Non-critical telemetry sampling
  | 'CIRCUIT_BREAKER_OPEN';// SOAR & External Dispatch: Stop outbound executions

export type AiStatus =
  | 'DETERMINISTIC_ONLY'   // No AI involved; mathematical/cryptographic/rule-based
  | 'AI_ASSISTED_REVIEWED' // AI draft generation with mandatory human approval envelope
  | 'HUMAN_IN_THE_LOOP';   // Multi-approver sign-off required

export type VerificationMethod =
  | 'AUTOMATED_UNIT_TEST'
  | 'AUTOMATED_E2E_SPINE'
  | 'CRYPTOGRAPHIC_VERIFIER_CLI'
  | 'STATIC_ANALYSIS_LINTER'
  | 'MULTI_APPROVER_GATE_SIGN';

export type RequirementLifecycleStatus =
  | 'DRAFT'
  | 'ACTIVE_COMMITTED'
  | 'VERIFIED_RELEASED'
  | 'DEPRECATED'
  | 'REJECTED';

export interface RequirementNode {
  /** Stable Identifier (e.g. REQ-CORE-AUTH-01, REQ-EVID-MERKLE-01) */
  id: string;
  /** Semantic version string */
  version: string;
  /** Requirement Title */
  title: string;
  /** Definitive statement of required behavior */
  statement: string;
  /** §07 Tenant boundary scope */
  tenantScope: TenantScope;
  /** §07 Data classification boundary */
  dataScope: DataScope;
  /** §05 Authority / Originating controlled source */
  authority: {
    type: AuthorityType;
    reference: string;
  };
  /** §07 Failure / Outage / Partition behavior */
  failureBehavior: FailureBehavior;
  /** §07 AI governance status */
  aiStatus: AiStatus;
  /** §07 Evidence Obligation */
  evidenceObligation: {
    requiresMerkleProof: boolean;
    requiresWitnessSeal: boolean;
    requiresPostQuantumSignature: boolean;
  };
  /** §07 Testable Acceptance Criteria */
  acceptanceCriteria: string[];
  /** §07 Verification Method */
  verificationMethod: VerificationMethod;
  /** Direct link to test file, evidence gate, or spec implementation */
  traceability: {
    implementingModule: string;
    sourceFilePath?: string;
    testFilePath?: string;
    evidenceGateId?: string;
  };
  /** Lifecycle Status */
  status: RequirementLifecycleStatus;
  createdAt: string;
  updatedAt: string;
}
