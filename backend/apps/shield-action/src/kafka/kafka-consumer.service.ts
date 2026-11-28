import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { ConsumerSupervisor } from '../../../../libs/kafka/src/consumer-supervisor';
import { createKafka } from '../../../../libs/kafka/src/kafka-client';
import { EventEnvelope } from './kafka-producer.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  runWithPlatformScope,
  runWithTenantScope,
} from '../../../../libs/database/src';

export type KafkaMessageHandler = (
  envelope: EventEnvelope<any>,
) => Promise<void>;

/**
 * shield-action's first-ever Kafka consumer. Same pattern as shield-core's
 * KafkaConsumerService (registerHandler from each consumer's own
 * OnModuleInit; subscribe/connect deferred to onApplicationBootstrap so
 * every handler is guaranteed registered first — this exact ordering bug
 * was found and fixed in shield-core's version, applied here from the
 * start). InboxEvent dedup guards every consumed message before any
 * handler runs.
 */
@Injectable()
export class KafkaConsumerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(KafkaConsumerService.name);
  private readonly kafka: Kafka;
  private readonly handlers = new Map<string, KafkaMessageHandler[]>();
  private readonly supervisor: ConsumerSupervisor;

  constructor(private readonly prisma: PrismaService) {
    this.kafka = createKafka('zoiko-shield-action-consumer');
    // Startup is supervised and retried (see ConsumerSupervisor): connecting once and
    // logging a failure left this consumer dead for good after a broker restart.
    this.supervisor = new ConsumerSupervisor({
      name: 'shield-action',
      topics: () => [...this.handlers.keys()],
      buildConsumer: () => this.buildConsumer(),
      eachMessage: (payload) => this.handleMessageInScope(payload),
      logger: this.logger,
    });
  }

  registerHandler(topic: string, handler: KafkaMessageHandler): void {
    const existing = this.handlers.get(topic) ?? [];
    existing.push(handler);
    this.handlers.set(topic, existing);
  }

  /** Overridable so tests can supply a fake consumer. */
  protected buildConsumer(): Consumer {
    return this.kafka.consumer({ groupId: 'shield-action-response' });
  }

  getStatus() {
    return this.supervisor.getStatus();
  }

  onApplicationBootstrap() {
    if (this.handlers.size === 0) {
      this.logger.warn(
        'No Kafka handlers registered — consumer will not subscribe to any topic.',
      );
      return;
    }
    // Not awaited: the service must come up even when Kafka is down.
    this.supervisor.start();
  }

  private handleMessageInScope(payload: EachMessagePayload): Promise<void> {
    let tenantId: unknown;
    try {
      tenantId = payload.message.value
        ? JSON.parse(payload.message.value.toString())?.tenantId
        : undefined;
    } catch {
      tenantId = undefined; // handleMessage logs and skips malformed input
    }
    return typeof tenantId === 'string' && tenantId.length > 0
      ? runWithTenantScope(tenantId, () => this.handleMessage(payload))
      : runWithPlatformScope(
          `kafka ${payload.topic} message without tenant`,
          () => this.handleMessage(payload),
        );
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

    if (allHandlersSucceeded) {
      await this.prisma.inboxEvent
        .create({
          data: {
            event_id: envelope.eventId,
            topic,
            tenant_id: envelope.tenantId,
          },
        })
        .catch((err) =>
          this.logger.warn(
            `Failed to record inbox entry for ${envelope.eventId}: ${(err as Error).message}`,
          ),
        );
    }
  }

  async onModuleDestroy() {
    await this.supervisor.stop();
  }
}
