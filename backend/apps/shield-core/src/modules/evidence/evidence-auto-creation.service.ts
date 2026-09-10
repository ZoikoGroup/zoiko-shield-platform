import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaConsumerService } from '../../kafka/kafka-consumer.service';
import { EventEnvelope } from '../../kafka/kafka-producer.service';
import { EvidenceService } from './services/evidence.service';

/** Must match shield-ingest's ALERT_TOPICS.ALERT_CREATED exactly (apps/shield-ingest/src/alerts/events/alert-events.ts) — no shared package exists yet, so this string is duplicated deliberately rather than silently drifting. */
const ALERT_CREATED_TOPIC = 'alert.created.v1';
/** Must match shield-ai's CANONICAL_TOPICS.AI_OUTPUT_REVIEWED (apps/shield-ai/src/kafka/kafka-producer.service.ts). */
const AI_OUTPUT_REVIEWED_TOPIC = 'ai.output.reviewed.v1';

/**
 * Automatic evidence creation (spec §36). Three trigger paths:
 *  1. Consumed alert.created (Kafka) — shield-core's consumer for alert appearance.
 *  2. Consumed ai.output.reviewed.v1 (Kafka) — shield-ai human oversight decisions (§16/§36).
 *  3. In-process calls from case-management (decisions/transitions),
 *     since those happen in the same app — no Kafka round-trip needed.
 */
@Injectable()
export class EvidenceAutoCreationService implements OnModuleInit {
  private readonly logger = new Logger(EvidenceAutoCreationService.name);

  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    private readonly evidenceService: EvidenceService,
  ) { }

  onModuleInit(): void {
    this.kafkaConsumer.registerHandler(
      ALERT_CREATED_TOPIC,
      this.handleAlertCreated.bind(this),
    );
    this.kafkaConsumer.registerHandler(
      AI_OUTPUT_REVIEWED_TOPIC,
      this.handleAiDecisionRecorded.bind(this),
    );
  }

  private async handleAlertCreated(
    envelope: EventEnvelope<any>,
  ): Promise<void> {
    const {
      tenantId,
      environmentId,
      region,
      alertId,
      detectionMatchId,
      severity,
    } = envelope.payload ?? {};
    if (!tenantId || !environmentId || !alertId) {
      throw new Error(
        `Malformed alert.created payload: ${JSON.stringify(envelope.payload)}`,
      );
    }

    await this.evidenceService.createEvidence({
      tenantId,
      environmentId,
      region,
      evidenceType: 'ALERT_CREATION',
      producingService: 'shield-core-evidence-auto-creation',
      sourceSystemId: 'shield-ingest-alert-service',
      sourceObjectId: alertId,
      purpose: 'INVESTIGATION',
      content: {
        alertId,
        detectionMatchId,
        severity,
        triggeringEvent: envelope.eventType,
      },
    });
  }

  async createForCaseTransition(params: {
    tenantId: string;
    environmentId: string;
    region: string;
    caseId: string;
    fromState: string;
    toState: string;
    actorId: string;
    reason: string;
  }) {
    return this.evidenceService.createEvidence({
      tenantId: params.tenantId,
      environmentId: params.environmentId,
      region: params.region,
      evidenceType: 'CASE_STATE_TRANSITION',
      producingService: 'case-management',
      sourceSystemId: 'shield-core-case',
      sourceObjectId: params.caseId,
      purpose: 'INVESTIGATION',
      content: {
        caseId: params.caseId,
        fromState: params.fromState,
        toState: params.toState,
        actorId: params.actorId,
        reason: params.reason,
      },
    });
  }

  async createForCaseDecision(params: {
    tenantId: string;
    environmentId: string;
    region: string;
    caseId: string;
    decisionType: string;
    decision: string;
    rationale: string;
    actorId: string;
  }) {
    return this.evidenceService.createEvidence({
      tenantId: params.tenantId,
      environmentId: params.environmentId,
      region: params.region,
      evidenceType: 'CASE_DECISION',
      producingService: 'case-management',
      sourceSystemId: 'shield-core-case',
      sourceObjectId: params.caseId,
      purpose: 'DECISION_RECORD',
      content: {
        caseId: params.caseId,
        decisionType: params.decisionType,
        decision: params.decision,
        rationale: params.rationale,
        actorId: params.actorId,
      },
    });
  }

  private async handleAiDecisionRecorded(
    envelope: EventEnvelope<any>,
  ): Promise<void> {
    const {
      tenantId,
      environmentId = 'default-env',
      region = 'eu-west-1',
      envelopeId,
      state,
      decision,
      decidedBy,
      rationale,
      modifiedContent,
      escalatedToRole,
      evidenceRef,
      aiLabelAndUseCaseName,
      sourcesAndSpans,
      calibratedConfidenceAndUncertainty,
      expectedImpactAndReversibility,
      requiredAuthorityAndApprovals,
      caseId,
    } = envelope.payload ?? {};

    if (!tenantId || !envelopeId || !decision || !decidedBy) {
      this.logger.warn(
        `Received incomplete ai.decision_rights.recorded payload: ${JSON.stringify(envelope.payload)}`,
      );
      return;
    }

    try {
      await this.evidenceService.createEvidence({
        tenantId,
        environmentId,
        region,
        evidenceType: 'AI_HUMAN_DECISION_RECORD',
        producingService: 'shield-ai-decision-rights',
        sourceSystemId: 'shield-ai',
        sourceObjectId: envelopeId,
        purpose: 'DECISION_RECORD',
        caseId: caseId || undefined,
        addedBy: decidedBy,
        content: {
          envelopeId,
          decisionState: state,
          decision,
          decidedBy,
          rationale,
          modifiedContent,
          escalatedToRole,
          evidenceRef,
          aiLabelAndUseCaseName,
          sourcesAndSpans,
          calibratedConfidenceAndUncertainty,
          expectedImpactAndReversibility,
          requiredAuthorityAndApprovals,
          triggeringEvent: envelope.eventType,
          recordedAt: new Date().toISOString(),
        },
      });
      this.logger.log(
        `✔ Anchored AI human decision record into Evidence Ledger for envelope '${envelopeId}' (Tenant: ${tenantId})`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to anchor AI human decision for envelope '${envelopeId}': ${(err as Error).message}`,
      );
      throw err;
    }
  }
}
