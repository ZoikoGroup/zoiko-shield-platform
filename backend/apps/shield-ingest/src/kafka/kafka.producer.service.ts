/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';
import { randomUUID } from 'crypto';
import { ZoikoShieldCanonicalEvent } from '../connectors/providers/microsoft-entra/entra.types';
import { requireTenantId } from '../security/tenant-context';

/**
 * Canonical topic names shield-ingest owns/publishes. detection.* and
 * alert.* moved to shield-core's own CANONICAL_TOPICS when those modules
 * moved there — no longer published from this app.
 */
export const CANONICAL_TOPICS = {
  EVENT_NORMALIZED: 'event.normalized.v1',
  IDENTITY_DIRECTORY_SYNC: 'identity.directory-sync.v1',
  IDENTITY_SIGNIN: 'identity.signin.v1',
  CONNECTOR_SYNC_COMPLETED: 'connector.sync.completed.v1',
  CONNECTOR_HEALTH_CHANGED: 'connector.health.changed.v1',
  CONNECTOR_PERMISSION_CHANGED: 'connector.permission.changed.v1',
  CONNECTOR_EVENT_QUARANTINED: 'connector.event.quarantined.v1',
} as const;

/**
 * eventId is the inbox dedup key on the consuming side — Kafka redelivery
 * of the same eventId must never re-run a handler (see
 * KafkaConsumerService.handleMessage in shield-core). tenantId/occurredAt
 * are promoted to top level (not just inside payload) so the consumer can
 * make inbox/partitioning/staleness decisions without parsing payload.
 */
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
      clientId: 'zoiko-shield-ingest',
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
    this.logger.log('Kafka Producer disconnected.');
  }

  /**
   * Publishes a generic event payload to a Kafka topic.
   */
  async emit(topic: string, payload: any) {
    try {
      const key = requireTenantId(payload.tenantId, payload.tenant_id);
      await this.producer.send({
        topic,
        messages: [
          {
            key,
            value: JSON.stringify(payload),
          },
        ],
      });
      this.logger.debug(`Successfully emitted event to Kafka topic ${topic}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to emit event to Kafka topic ${topic}: ${error.message}`,
      );
      throw error;
    }
  }

  async publishEvent<T extends { tenantId: string }>(
    topic: string,
    eventType: string,
    payload: T,
    options?: {
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
      tenantId: requireTenantId(payload.tenantId),
      correlationId: options?.correlationId ?? randomUUID(),
      causationId: options?.causationId,
      traceId: options?.traceId ?? randomUUID(),
      occurredAt: (options?.occurredAt ?? producedAt).toISOString(),
      producedAt: producedAt.toISOString(),
      payload,
    };
    await this.producer.send({
      topic,
      messages: [{ key: envelope.tenantId, value: JSON.stringify(envelope) }],
    });
    this.logger.debug(`Published ${eventType} to ${topic}`);
    return envelope;
  }

  /**
   * Publishes a canonical event to the specified Kafka topic.
   */
  async publishCanonicalEvent(event: ZoikoShieldCanonicalEvent) {
    return this.publishEvent(
      CANONICAL_TOPICS.IDENTITY_SIGNIN,
      event.event_type,
      { tenantId: event.tenant_id, ...event },
      {
        correlationId: event.correlation_id,
        occurredAt: new Date(event.event_timestamp),
      },
    );
  }
}
