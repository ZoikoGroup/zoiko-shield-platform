import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaConsumerService } from '../../../kafka/kafka-consumer.service';
import { EventEnvelope } from '../../../kafka/kafka-producer.service';
import { CaseTimelineService } from '../../case-management/timeline/case-timeline.service';
import { EvidenceService } from '../../evidence/services/evidence.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { requireEnvironmentId } from '../../../tenant-context';

/** Must match shield-action's CANONICAL_TOPICS.ACTION_SIMULATED exactly (apps/shield-action/src/kafka/kafka-producer.service.ts) — no shared package exists yet. */
const ACTION_SIMULATED_TOPIC = 'action.simulated.v1';

interface ActionSimulatedPayload {
  tenantId: string;
  environmentId: string;
  proposalId: string;
  approvalId: string;
  caseId?: string;
  alertId?: string;
  actionCommandId: string;
  actionReceiptId: string;
  actionType: string;
  targetType: string;
  targetId: string;
  authorityLevel: string;
  status: string;
}

/**
 * shield-core's second Kafka consumer (first was event.normalized.v1 in
 * the previous milestone). Push-driven, not a poll — the DoD requires the
 * case timeline and evidence to update as a *consequence* of the response
 * workflow. InboxEvent dedup (already applied generically by
 * KafkaConsumerService.handleMessage) guarantees a duplicated
 * action.simulated.v1 delivery can never double-create these rows.
 */
@Injectable()
export class ActionSimulatedConsumer implements OnModuleInit {
  private readonly logger = new Logger(ActionSimulatedConsumer.name);

  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    private readonly timeline: CaseTimelineService,
    private readonly evidenceService: EvidenceService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    this.kafkaConsumer.registerHandler(ACTION_SIMULATED_TOPIC, this.handle.bind(this));
  }

  private async handle(envelope: EventEnvelope<ActionSimulatedPayload>): Promise<void> {
    const payload = envelope.payload;
    if (!payload?.tenantId || !payload?.caseId) {
      this.logger.debug(`action.simulated.v1 with no caseId — nothing to update on a case timeline (proposal ${payload?.proposalId ?? 'unknown'})`);
      return;
    }

    const caseRecord = await this.prisma.case.findFirst({
      where: { id: payload.caseId, tenant_id: payload.tenantId },
      select: { environment_id: true, region: true },
    });
    if (!caseRecord) {
      throw new Error(`Case '${payload.caseId}' not found for action simulation evidence`);
    }

    const evidence = await this.evidenceService.createEvidence({
      tenantId: payload.tenantId,
      environmentId: requireEnvironmentId(caseRecord.environment_id, payload.environmentId),
      region: caseRecord.region,
      evidenceType: 'ACTION_SIMULATION_RECEIPT',
      producingService: 'shield-action',
      sourceSystemId: 'shield-action',
      sourceObjectId: payload.actionReceiptId,
      purpose: 'RESPONSE_RECORD',
      content: {
        proposalId: payload.proposalId,
        approvalId: payload.approvalId,
        actionCommandId: payload.actionCommandId,
        actionReceiptId: payload.actionReceiptId,
        actionType: payload.actionType,
        targetType: payload.targetType,
        targetId: payload.targetId,
        authorityLevel: payload.authorityLevel,
        status: payload.status,
      },
    });

    await this.timeline.append({
      tenantId: payload.tenantId,
      caseId: payload.caseId,
      entryType: 'ACTION_RECOMMENDED',
      actorId: 'shield-action',
      title: `Response action simulated: ${payload.actionType}`,
      summary: `${payload.status} — target ${payload.targetType}:${payload.targetId}, authority ${payload.authorityLevel}`,
      evidenceRef: evidence.id,
      correlationId: envelope.correlationId,
    });
  }
}
