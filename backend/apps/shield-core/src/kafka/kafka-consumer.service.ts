import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { EventEnvelope } from './kafka-producer.service';
import { PrismaService } from '../prisma/prisma.service';

export type KafkaMessageHandler = (
  envelope: EventEnvelope<any>,
) => Promise<void>;

/**
 * shield-core's first-ever Kafka consumer. Handlers register themselves
 * against a topic from each consumer's own OnModuleInit (see
 * EvidenceAutoCreationService, NormalizedEventConsumer,
 * IdentityDirectorySyncConsumer) — this module has no compile-time
 * knowledge of who's listening, keeping KafkaModule free of a dependency
 * on the feature modules.
 *
 * Subscribing/connecting happens in onApplicationBootstrap, NOT
 * onModuleInit: Nest fires onModuleInit hooks in import-graph order, and
 * since KafkaModule is @Global() there's no guarantee every consumer's
 * onModuleInit (which calls registerHandler) has already run by the time
 * this module's onModuleInit fires — an early run was observed connecting
 * with zero registered handlers. onApplicationBootstrap fires only after
 * every module's onModuleInit has completed, so all handlers are
 * guaranteed registered first.
 *
 * Every consumed message is deduplicated via InboxEvent.event_id before
 * any handler runs — Kafka redelivery of the same eventId can never
 * re-trigger context resolution, detection, alerting, or evidence
 * creation. This is a safety net on top of (not a replacement for) the
 * idempotent upserts already in each domain (alias unique keys,
 * DetectionMatch's dedup key, Alert's [tenant_id, detection_match_id]).
 */
@Injectable()
export class KafkaConsumerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(KafkaConsumerService.name);
  private readonly kafka: Kafka;
  private readonly consumer: Consumer;
  private readonly handlers = new Map<string, KafkaMessageHandler[]>();

  constructor(private readonly prisma: PrismaService) {
    this.kafka = new Kafka({
      clientId: 'zoiko-shield-core-consumer',
      brokers: [process.env.KAFKA_BROKERS || 'localhost:9092'],
    });
    this.consumer = this.kafka.consumer({
      groupId: 'shield-core-case-evidence',
    });
  }

  registerHandler(topic: string, handler: KafkaMessageHandler): void {
    const existing = this.handlers.get(topic) ?? [];
    existing.push(handler);
    this.handlers.set(topic, existing);
  }

  async onApplicationBootstrap() {
    if (this.handlers.size === 0) {
      this.logger.warn(
        'No Kafka handlers registered — consumer will not subscribe to any topic.',
      );
      return;
    }

    try {
      await this.consumer.connect();
      await Promise.all(
        [...this.handlers.keys()].map((topic) =>
          this.consumer.subscribe({ topic, fromBeginning: false }),
        ),
      );

      await this.consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          await this.handleMessage(payload);
        },
      });

      this.logger.log(
        `Kafka consumer subscribed to: ${[...this.handlers.keys()].join(', ')}`,
      );
    } catch (error: any) {
      this.logger.error(`Failed to start Kafka consumer: ${error.message}`);
    }
  }

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, message } = payload;
    if (!message.value) return;

    let envelope: EventEnvelope<any>;
    try {
      envelope = JSON.parse(message.value.toString());
    } catch (err) {
      this.logger.error(
        `Malformed message on ${topic}, skipping: ${(err as Error).message}`,
      );
      return;
    }

    const alreadyProcessed = await this.prisma.inboxEvent.findUnique({
      where: { event_id: envelope.eventId },
    });
    if (alreadyProcessed) {
      this.logger.debug(
        `Skipping already-processed event ${envelope.eventId} on ${topic} (inbox dedup)`,
      );
      return;
    }

    const handlers = this.handlers.get(topic) ?? [];
    let allHandlersSucceeded = true;
    for (const handler of handlers) {
      try {
        await handler(envelope);
      } catch (err) {
        allHandlersSucceeded = false;
        this.logger.error(
          `Handler for ${topic} failed on event ${envelope.eventId}: ${(err as Error).message}`,
        );
      }
    }

    if (!allHandlersSucceeded) {
      throw new Error(
        `One or more handlers failed for event ${envelope.eventId} on ${topic}`,
      );
    }

    // Only record the inbox entry once every handler has succeeded — a
    // failed handler should still see this message redelivered.
    await this.prisma.inboxEvent.create({
      data: { event_id: envelope.eventId, topic, tenant_id: envelope.tenantId },
    });
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
  }
}
