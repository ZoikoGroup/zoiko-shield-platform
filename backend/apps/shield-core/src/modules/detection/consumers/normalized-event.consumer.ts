import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaConsumerService } from '../../../kafka/kafka-consumer.service';
import { EventEnvelope } from '../../../kafka/kafka-producer.service';
import { ContextResolutionService } from '../../security-context/context/context-resolution.service';
import { DetectionRuntimeService } from '../runtime/detection-runtime.service';
import { NormalizedEventContract } from '../../security-context/context/context.types';

/** Must match shield-ingest's CANONICAL_TOPICS.EVENT_NORMALIZED exactly (apps/shield-ingest/src/kafka/kafka.producer.service.ts) — no shared package exists yet. */
const EVENT_NORMALIZED_TOPIC = 'event.normalized.v1';

/**
 * Replaces the old in-process call chain normalization.service.ts used to
 * run directly (contextResolutionService.resolve then
 * detectionRuntimeService.evaluate) — now driven by the consumed
 * event.normalized.v1 message, since context-resolution and detection
 * moved into a different process (shield-core) than normalization
 * (shield-ingest).
 */
@Injectable()
export class NormalizedEventConsumer implements OnModuleInit {
  private readonly logger = new Logger(NormalizedEventConsumer.name);

  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    private readonly contextResolutionService: ContextResolutionService,
    private readonly detectionRuntimeService: DetectionRuntimeService,
  ) {}

  onModuleInit(): void {
    this.kafkaConsumer.registerHandler(
      EVENT_NORMALIZED_TOPIC,
      this.handle.bind(this),
    );
  }

  private async handle(
    envelope: EventEnvelope<NormalizedEventContract>,
  ): Promise<void> {
    const payload = envelope.payload;
    if (!payload?.tenantId || !payload?.normalizedEventId) {
      throw new Error(
        `Malformed event.normalized.v1 payload: ${JSON.stringify(payload)}`,
      );
    }

    const resolved =
      await this.contextResolutionService.resolveFromEvent(payload);
    await this.detectionRuntimeService.evaluateFromEvent(payload, resolved);
  }
}
