/**
 * AI Review Envelope Interface
 * Specification: ZoikoShield Combined Engineering Specifications §16 & §16.1
 * "Figure 11 - Human oversight and AI decision-rights model."
 * 
 * 16.1 Effective-review interface — every AI output surfaced for a decision must carry:
 * 1. AI label and use-case name
 * 2. Sources and exact supporting spans
 * 3. Known missing, stale or conflicting evidence
 * 4. Confidence and uncertainty stated in calibrated terms
 * 5. Alternative hypotheses or actions
 * 6. Expected impact and reversibility
 * 7. Required authority and approvals
 * 8. Accept, modify, reject and escalate controls
 * 9. Recorded human decision and rationale
 * 10. Appeal/feedback route where customer-affecting
 */

export type DecisionState =
  | 'UNREVIEWED'
  | 'ACCEPTED'
  | 'MODIFIED'
  | 'REJECTED'
  | 'ESCALATED';

export type DecisionTransition = 'ACCEPT' | 'MODIFY' | 'REJECT' | 'ESCALATE';

export type ResponseAuthorityTier = 'R0' | 'R1' | 'R2' | 'R3' | 'R4';

export type QualitativeConfidenceBand = 'HIGH' | 'MEDIUM' | 'LOW';

export interface AiLabelAndUseCase {
  aiLabel: string;
  useCaseName: string;
  modelRoute: string;
  version?: string;
}

export interface DecisionSourceSpan {
  sourceId: string;
  sourceType: string;
  version?: number;
  exactSpan: string;
  confidence: number;
}

export interface EvidenceCompletenessState {
  missingEvidence: string[];
  staleEvidence: string[];
  conflictingEvidence: string[];
}

export interface CalibratedConfidence {
  score: number; // 0.0 - 1.0
  qualitativeBand: QualitativeConfidenceBand;
  calibrationBasis: string;
  uncertaintyFactors: string[];
}

export interface AlternativeHypothesisOrAction {
  title: string;
  rationale: string;
  tradeOffs: string;
}

export interface ExpectedImpactAndReversibility {
  blastRadius: string;
  isReversible: boolean;
  reversibilityTier: ResponseAuthorityTier;
  compensationPlan?: string;
}

export interface RequiredAuthorityAndApprovals {
  requiredRole: string;
  responseAuthorityTier: ResponseAuthorityTier;
  dualApproverRequired: boolean;
}

export interface DecisionControls {
  availableTransitions: DecisionTransition[];
  state: DecisionState;
}

export interface RecordedHumanDecision {
  decidedBy?: string;
  decision?: DecisionTransition;
  rationale?: string;
  modifiedContent?: string;
  decidedAt?: string;
  escalatedToRole?: string;
  evidenceRef?: string;
}

export interface AppealOrFeedbackRoute {
  appealUrl: string; // [derived]
  feedbackChannel: string;
  customerAffecting: boolean;
}

/**
 * 10-Field Mandatory Review Envelope per Spec §16.1
 */
export interface AiReviewEnvelope<T = any> {
  envelopeId: string;
  tenantId: string;
  environmentId: string;
  createdAt: string;

  // 1. AI label and use-case name
  aiLabelAndUseCaseName: AiLabelAndUseCase;

  // 2. Sources and exact supporting spans
  sourcesAndSpans: DecisionSourceSpan[];

  // 3. Known missing, stale or conflicting evidence
  knownMissingStaleOrConflictingEvidence: EvidenceCompletenessState;

  // 4. Confidence and uncertainty stated in calibrated terms
  calibratedConfidenceAndUncertainty: CalibratedConfidence;

  // 5. Alternative hypotheses or actions
  alternativeHypothesesOrActions: AlternativeHypothesisOrAction[];

  // 6. Expected impact and reversibility
  expectedImpactAndReversibility: ExpectedImpactAndReversibility;

  // 7. Required authority and approvals
  requiredAuthorityAndApprovals: RequiredAuthorityAndApprovals;

  // 8. Accept, modify, reject and escalate controls
  controls: DecisionControls;

  // 9. Recorded human decision and rationale
  humanDecisionAndRationale: RecordedHumanDecision;

  // 10. Appeal/feedback route where customer-affecting
  appealOrFeedbackRoute: AppealOrFeedbackRoute;

  // Payload content being governed
  payload: T;
}
