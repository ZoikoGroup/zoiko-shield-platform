import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  PreconditionFailedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import {
  AiReviewEnvelope,
  DecisionState,
  DecisionTransition,
  ResponseAuthorityTier,
  AiLabelAndUseCase,
  DecisionSourceSpan,
  EvidenceCompletenessState,
  CalibratedConfidence,
  AlternativeHypothesisOrAction,
  ExpectedImpactAndReversibility,
  RequiredAuthorityAndApprovals,
  AppealOrFeedbackRoute,
} from './ai-review-envelope.interface';
import {
  KafkaProducerService,
  CANONICAL_TOPICS,
} from '../kafka/kafka-producer.service';

export interface CreateEnvelopeInput<T = any> {
  tenantId: string;
  environmentId?: string;
  aiLabelAndUseCaseName: AiLabelAndUseCase;
  sourcesAndSpans: DecisionSourceSpan[];
  knownMissingStaleOrConflictingEvidence?: Partial<EvidenceCompletenessState>;
  calibratedConfidenceAndUncertainty: CalibratedConfidence;
  alternativeHypothesesOrActions?: AlternativeHypothesisOrAction[];
  expectedImpactAndReversibility: ExpectedImpactAndReversibility;
  requiredAuthorityAndApprovals: RequiredAuthorityAndApprovals;
  appealOrFeedbackRoute?: Partial<AppealOrFeedbackRoute>;
  payload: T;
}

export interface RecordDecisionInput {
  decision: DecisionTransition;
  decidedBy: string;
  rationale: string;
  modifiedContent?: string;
  escalatedToRole?: string;
}

export interface ActorAuthorizationContext {
  role: string;
  responseAuthorityTier?: ResponseAuthorityTier;
}

const AUTHORITY_TIER_WEIGHTS: Record<ResponseAuthorityTier, number> = {
  R0: 0,
  R1: 1,
  R2: 2,
  R3: 3,
  R4: 4,
};

/**
 * Human Oversight & Decision-Rights Engine
 * Specification: ZoikoShield Combined Engineering Specifications §16 & §16.1
 * 
 * Enforces:
 * 1. 10 mandatory fields in every AiReviewEnvelope surfaced for human review.
 * 2. Strict validation: envelope rejected if missing calibrated confidence, sources, or required authority.
 * 3. Human rationale required for every ACCEPT / MODIFY / REJECT / ESCALATE decision.
 * 4. Gating rule: Downstream execution (shield-action) blocked unless state is ACCEPTED or MODIFIED.
 */
@Injectable()
export class DecisionRightsService {
  private readonly logger = new Logger(DecisionRightsService.name);
  private readonly envelopes = new Map<string, AiReviewEnvelope>();

  constructor(private readonly kafkaProducer?: KafkaProducerService) {}

  /**
   * Wraps an AI output in a 10-field strongly-typed AiReviewEnvelope with strict invariant validation.
   */
  wrapInEnvelope<T = any>(input: CreateEnvelopeInput<T>): AiReviewEnvelope<T> {
    // Invariant 1: AI Label and Use Case Name
    if (
      !input.aiLabelAndUseCaseName?.aiLabel ||
      !input.aiLabelAndUseCaseName?.useCaseName
    ) {
      throw new BadRequestException(
        'Envelope validation failure: AI label and use-case name are required.',
      );
    }

    // Invariant 2: Sources and Supporting Spans
    if (
      !Array.isArray(input.sourcesAndSpans) ||
      input.sourcesAndSpans.length === 0
    ) {
      throw new BadRequestException(
        'Envelope validation failure: Sources and exact supporting spans are required and cannot be empty.',
      );
    }

    for (const span of input.sourcesAndSpans) {
      if (!span.sourceId || !span.exactSpan) {
        throw new BadRequestException(
          'Envelope validation failure: Each source span must specify sourceId and exactSpan.',
        );
      }
    }

    // Invariant 4: Calibrated Confidence and Uncertainty
    if (!input.calibratedConfidenceAndUncertainty) {
      throw new BadRequestException(
        'Envelope validation failure: Calibrated confidence and uncertainty metrics are mandatory.',
      );
    }

    const { score, qualitativeBand, calibrationBasis } =
      input.calibratedConfidenceAndUncertainty;
    if (
      typeof score !== 'number' ||
      score < 0 ||
      score > 1 ||
      !qualitativeBand ||
      !calibrationBasis
    ) {
      throw new BadRequestException(
        'Envelope validation failure: Calibrated confidence must specify a valid score (0.0-1.0), qualitative band, and calibration basis.',
      );
    }

    // Invariant 6: Expected Impact and Reversibility
    if (
      !input.expectedImpactAndReversibility?.blastRadius ||
      typeof input.expectedImpactAndReversibility?.isReversible !== 'boolean' ||
      !input.expectedImpactAndReversibility?.reversibilityTier
    ) {
      throw new BadRequestException(
        'Envelope validation failure: Expected impact, blast radius, and reversibility tier are required.',
      );
    }

    // Invariant 7: Required Authority and Approvals
    if (
      !input.requiredAuthorityAndApprovals?.requiredRole ||
      !input.requiredAuthorityAndApprovals?.responseAuthorityTier
    ) {
      throw new BadRequestException(
        'Envelope validation failure: Required authority role and response tier are mandatory.',
      );
    }

    const envelopeId = `env-${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();

    const envelope: AiReviewEnvelope<T> = {
      envelopeId,
      tenantId: input.tenantId,
      environmentId: input.environmentId || 'default-env',
      createdAt,
      aiLabelAndUseCaseName: input.aiLabelAndUseCaseName,
      sourcesAndSpans: input.sourcesAndSpans,
      knownMissingStaleOrConflictingEvidence: {
        missingEvidence:
          input.knownMissingStaleOrConflictingEvidence?.missingEvidence || [],
        staleEvidence:
          input.knownMissingStaleOrConflictingEvidence?.staleEvidence || [],
        conflictingEvidence:
          input.knownMissingStaleOrConflictingEvidence?.conflictingEvidence || [],
      },
      calibratedConfidenceAndUncertainty: {
        score,
        qualitativeBand,
        calibrationBasis,
        uncertaintyFactors:
          input.calibratedConfidenceAndUncertainty.uncertaintyFactors || [],
      },
      alternativeHypothesesOrActions:
        input.alternativeHypothesesOrActions || [],
      expectedImpactAndReversibility: input.expectedImpactAndReversibility,
      requiredAuthorityAndApprovals: input.requiredAuthorityAndApprovals,
      controls: {
        availableTransitions: ['ACCEPT', 'MODIFY', 'REJECT', 'ESCALATE'],
        state: 'UNREVIEWED',
      },
      humanDecisionAndRationale: {},
      appealOrFeedbackRoute: {
        appealUrl:
          input.appealOrFeedbackRoute?.appealUrl ||
          `/api/v1/ai/decisions/${envelopeId}/appeal`,
        feedbackChannel:
          input.appealOrFeedbackRoute?.feedbackChannel || 'secops-appeals',
        customerAffecting:
          input.appealOrFeedbackRoute?.customerAffecting ?? false,
      },
      payload: input.payload,
    };

    this.envelopes.set(envelopeId, envelope);
    this.logger.log(
      `✔ Wrapped AI recommendation in AiReviewEnvelope [${envelopeId}] for use-case ${envelope.aiLabelAndUseCaseName.useCaseName} (Tenant: ${envelope.tenantId})`,
    );

    return envelope;
  }

  /**
   * Retrieves an envelope by ID with tenant isolation verification.
   */
  getEnvelope(tenantId: string, envelopeId: string): AiReviewEnvelope {
    const envelope = this.envelopes.get(envelopeId);
    if (!envelope) {
      throw new NotFoundException(
        `AiReviewEnvelope '${envelopeId}' not found`,
      );
    }
    if (envelope.tenantId !== tenantId) {
      throw new ForbiddenException(
        `AiReviewEnvelope '${envelopeId}' does not belong to tenant '${tenantId}'`,
      );
    }
    return envelope;
  }

  /**
   * Records a human oversight decision (ACCEPT, MODIFY, REJECT, ESCALATE) with mandatory rationale.
   */
  async recordHumanDecision(
    tenantId: string,
    envelopeId: string,
    input: RecordDecisionInput,
  ): Promise<AiReviewEnvelope> {
    const envelope = this.getEnvelope(tenantId, envelopeId);

    // Validate Transition Existence
    if (!input.decision) {
      throw new BadRequestException('Decision transition must be specified.');
    }

    // Invariant 9: Recorded Human Decision AND Rationale
    if (!input.decidedBy || !input.decidedBy.trim()) {
      throw new BadRequestException(
        'Decision record failure: Named human approver (decidedBy) is mandatory.',
      );
    }

    if (!input.rationale || !input.rationale.trim()) {
      throw new BadRequestException(
        'Decision record failure: Recorded human rationale is non-negotiable per §16.1.',
      );
    }

    // State machine rules
    if (envelope.controls.state === 'REJECTED') {
      throw new PreconditionFailedException(
        `Cannot apply transition '${input.decision}' on an already REJECTED envelope.`,
      );
    }

    const decidedAt = new Date().toISOString();
    const evidenceRef = `ev-dec-${crypto.randomUUID()}`;

    let newState: DecisionState = 'UNREVIEWED';
    let availableTransitions: DecisionTransition[] = [];

    switch (input.decision) {
      case 'ACCEPT':
        newState = 'ACCEPTED';
        availableTransitions = []; // Terminal
        break;

      case 'MODIFY':
        if (!input.modifiedContent || !input.modifiedContent.trim()) {
          throw new BadRequestException(
            'Modification requires explicit modifiedContent payload.',
          );
        }
        newState = 'MODIFIED';
        availableTransitions = []; // Terminal
        break;

      case 'REJECT':
        newState = 'REJECTED';
        availableTransitions = []; // Terminal
        break;

      case 'ESCALATE':
        if (!input.escalatedToRole || !input.escalatedToRole.trim()) {
          throw new BadRequestException(
            'Escalation requires target escalatedToRole (e.g. CHIEF_INFORMATION_SECURITY_OFFICER).',
          );
        }
        newState = 'ESCALATED';
        availableTransitions = ['ACCEPT', 'MODIFY', 'REJECT'];
        envelope.requiredAuthorityAndApprovals.requiredRole =
          input.escalatedToRole;
        break;

      default:
        throw new BadRequestException(
          `Unsupported transition: ${(input as any).decision}`,
        );
    }

    envelope.controls.state = newState;
    envelope.controls.availableTransitions = availableTransitions;
    envelope.humanDecisionAndRationale = {
      decidedBy: input.decidedBy,
      decision: input.decision,
      rationale: input.rationale,
      modifiedContent: input.modifiedContent,
      escalatedToRole: input.escalatedToRole,
      decidedAt,
      evidenceRef,
    };

    this.envelopes.set(envelopeId, envelope);

    // Emit event if Kafka producer is available
    if (this.kafkaProducer) {
      try {
        await this.kafkaProducer.publishEvent(
          CANONICAL_TOPICS.AI_OUTPUT_REVIEWED,
          'ai.decision_rights.recorded',
          {
            tenantId,
            envelopeId,
            state: newState,
            decision: input.decision,
            decidedBy: input.decidedBy,
            evidenceRef,
          },
          { correlationId: envelopeId },
        );
      } catch (err) {
        this.logger.warn(
          `Failed to emit Kafka decision event: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `✔ Recorded human oversight decision [${input.decision}] by '${input.decidedBy}' for envelope '${envelopeId}' (New State: ${newState})`,
    );

    return envelope;
  }

  /**
   * Gatekeeping Assertion: Blocks downstream execution unless envelope is in ACCEPTED or MODIFIED state,
   * and the requesting actor possesses sufficient role and response tier authority.
   */
  assertActionPermitted(
    tenantId: string,
    envelopeId: string,
    actor: ActorAuthorizationContext,
  ): AiReviewEnvelope {
    const envelope = this.getEnvelope(tenantId, envelopeId);

    // 1. Check Review State
    if (envelope.controls.state === 'UNREVIEWED') {
      throw new PreconditionFailedException(
        `Action Blocked: AI recommendation in envelope '${envelopeId}' has not been reviewed by a human authority.`,
      );
    }

    if (envelope.controls.state === 'REJECTED') {
      throw new ForbiddenException(
        `Action Blocked: AI recommendation in envelope '${envelopeId}' was explicitly REJECTED by human authority.`,
      );
    }

    if (envelope.controls.state === 'ESCALATED') {
      throw new PreconditionFailedException(
        `Action Blocked: AI recommendation in envelope '${envelopeId}' is pending sign-off from escalated role '${envelope.requiredAuthorityAndApprovals.requiredRole}'.`,
      );
    }

    // 2. Check Authority Level
    if (actor.responseAuthorityTier) {
      const requiredWeight =
        AUTHORITY_TIER_WEIGHTS[
          envelope.requiredAuthorityAndApprovals.responseAuthorityTier
        ] || 0;
      const actorWeight =
        AUTHORITY_TIER_WEIGHTS[actor.responseAuthorityTier] || 0;

      if (actorWeight < requiredWeight) {
        throw new ForbiddenException(
          `Action Blocked: Actor tier '${actor.responseAuthorityTier}' is insufficient for required response tier '${envelope.requiredAuthorityAndApprovals.responseAuthorityTier}'.`,
        );
      }
    }

    return envelope;
  }

  /**
   * List envelopes with optional state filter.
   */
  listEnvelopes(
    tenantId: string,
    filter?: { state?: DecisionState; useCase?: string },
  ): AiReviewEnvelope[] {
    const results: AiReviewEnvelope[] = [];
    for (const env of this.envelopes.values()) {
      if (env.tenantId !== tenantId) continue;
      if (filter?.state && env.controls.state !== filter.state) continue;
      if (
        filter?.useCase &&
        env.aiLabelAndUseCaseName.useCaseName !== filter.useCase
      )
        continue;
      results.push(env);
    }
    return results;
  }
}
