/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';
import { ZoikoShieldCanonicalEvent } from '../connectors/microsoft-entra/entra.types';

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
