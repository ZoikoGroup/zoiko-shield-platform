/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';
import { randomUUID } from 'crypto';

/**
 * Canonical topic names owned by shield-action. Split at the sub-prefix
 * level from shield-core's action.proposed./action.approved./action.rejected.
 * so the two apps' outbox pollers never overlap under a broad "action." prefix.
 */
export const CANONICAL_TOPICS = {
  ACTION_SIMULATED: 'action.simulated.v1',
  COMMAND_SIGNED: 'command.signed.v1',
  ACTION_DISPATCHED: 'action.dispatched.v1',
  ACTION_RECEIPT_RECEIVED: 'action.receipt.received.v1',
  ACTION_RECEIPT_VERIFIED: 'action.receipt.verified.v1',
  ACTION_RECONCILIATION_COMPLETED: 'action.reconciliation.completed.v1',
  ACTION_ROLLBACK_STARTED: 'action.rollback.started.v1',
  ACTION_ROLLBACK_COMPLETED: 'action.rollback.completed.v1',
  ACTION_FROZEN: 'action.frozen.v1',
} as const;

export interface EventEnvelope<T = unknown> {
  eventId: string;
  eventType: string;
  eventVersion: string;
  tenantId: string;
  correlationId: string;
  causationId?: string;
  traceId: string;
  occurredAt: string;
  producedAt: string;
  payload: T;
}

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private kafka: Kafka;
  private producer: Producer;

  constructor() {
    this.kafka = new Kafka({
      clientId: 'zoiko-shield-action',
      brokers: [process.env.KAFKA_BROKERS || 'localhost:9092'],
    });
    this.producer = this.kafka.producer();
  }

  async onModuleInit() {
    try {
      await this.producer.connect();
      this.logger.log('Kafka Producer connected successfully.');
    } catch (error: any) {
      this.logger.error(`Failed to connect Kafka Producer: ${error.message}`);
    }
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
  }

  async publishEvent<T extends { tenantId: string }>(
    topic: string,
    eventType: string,
    payload: T,
    context?: {
      correlationId?: string;
      causationId?: string;
      traceId?: string;
      occurredAt?: Date;
    },
  ) {
    const producedAt = new Date();
    const envelope: EventEnvelope<T> = {
      eventId: randomUUID(),
      eventType,
      eventVersion: '1',
      tenantId: payload.tenantId,
      correlationId: context?.correlationId ?? randomUUID(),
      causationId: context?.causationId,
      traceId: context?.traceId ?? randomUUID(),
      occurredAt: (context?.occurredAt ?? producedAt).toISOString(),
      producedAt: producedAt.toISOString(),
      payload,
    };

    try {
      await this.producer.send({
        topic,
        messages: [{ key: payload.tenantId, value: JSON.stringify(envelope) }],
      });
      this.logger.debug(`Published ${eventType} to ${topic}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to publish ${eventType} to ${topic}: ${error.message}`,
      );
    }
  }
}
