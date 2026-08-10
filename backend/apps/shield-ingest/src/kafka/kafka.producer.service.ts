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
      const key = payload.tenantId || payload.tenant_id || 'default-key';
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
      this.logger.error(`Failed to emit event to Kafka topic ${topic}: ${error.message}`);
    }
  }

  /**
   * Publishes a canonical event to the specified Kafka topic.
   */
  async publishCanonicalEvent(event: ZoikoShieldCanonicalEvent) {

    const topic =
      process.env.KAFKA_CANONICAL_EVENTS_TOPIC || 'zoiko.events.canonical.v1';

    try {
      await this.producer.send({
        topic,
        messages: [
          {
            key: event.tenant_id, // Partition by tenant_id
            value: JSON.stringify(event),
          },
        ],
      });
      this.logger.debug(
        `Successfully published event ${event.source_event_id} to Kafka topic ${topic}`,
      );
    } catch (error: any) {
      this.logger.error(`Failed to publish event to Kafka: ${error.message}`);
      throw error;
    }
  }
}
