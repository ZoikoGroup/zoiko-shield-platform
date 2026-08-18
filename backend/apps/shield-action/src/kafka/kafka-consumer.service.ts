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
  private readonly consumer: Consumer;
  private readonly handlers = new Map<string, KafkaMessageHandler[]>();

  constructor(private readonly prisma: PrismaService) {
    this.kafka = new Kafka({
      clientId: 'zoiko-shield-action-consumer',
      brokers: [process.env.KAFKA_BROKERS || 'localhost:9092'],
    });
    this.consumer = this.kafka.consumer({ groupId: 'shield-action-response' });
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
    await this.consumer.disconnect();
  }
}
