import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { NormalizationService } from './normalization.service';

const TELEMETRY_INGESTED_TOPIC = 'telemetry.ingested';

interface TelemetryIngestedMessage {
  rawEventId?: string;
  status?: 'ACCEPTED' | 'DUPLICATE_IGNORED' | 'QUARANTINED';
}

/**
 * Closes the gap where RawIngestService published telemetry.ingested with
 * nothing consuming it: automatic normalization previously only ran for
 * the Microsoft Entra connector (triggered in-process from its own Event
 * Hub consumer/sign-in sync), leaving every other connector's raw events
 * stuck at RawEvent(ACCEPTED) until an analyst manually replayed them.
 * NormalizationService.normalizeRawEvent is idempotent per raw event
 * (skips work if already NORMALIZED), so Kafka redelivery here is safe
 * without a separate inbox table.
 */
@Injectable()
export class TelemetryIngestedConsumer
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(TelemetryIngestedConsumer.name);
  private readonly kafka: Kafka;
  private readonly consumer: Consumer;

  constructor(private readonly normalizationService: NormalizationService) {
    this.kafka = new Kafka({
      clientId: 'zoiko-shield-ingest-normalization-consumer',
      brokers: [process.env.KAFKA_BROKERS || 'localhost:9092'],
    });
    this.consumer = this.kafka.consumer({
      groupId: 'shield-ingest-normalization',
    });
  }

  async onApplicationBootstrap() {
    try {
      await this.consumer.connect();
      await this.consumer.subscribe({
        topic: TELEMETRY_INGESTED_TOPIC,
        fromBeginning: false,
      });
      await this.consumer.run({
        eachMessage: (payload: EachMessagePayload) =>
          this.handleMessage(payload),
      });
      this.logger.log(
        `Kafka consumer subscribed to ${TELEMETRY_INGESTED_TOPIC}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to start ${TELEMETRY_INGESTED_TOPIC} consumer: ${error.message}`,
      );
    }
  }

  private async handleMessage({ message }: EachMessagePayload): Promise<void> {
    if (!message.value) return;

    let event: TelemetryIngestedMessage;
    try {
      event = JSON.parse(message.value.toString());
    } catch (err) {
      this.logger.error(
        `Malformed ${TELEMETRY_INGESTED_TOPIC} message, skipping: ${(err as Error).message}`,
      );
      return;
    }

    if (event.status !== 'ACCEPTED' || !event.rawEventId) {
      return;
    }

    try {
      await this.normalizationService.normalizeRawEvent(event.rawEventId);
    } catch (err) {
      this.logger.error(
        `Failed to auto-normalize raw event ${event.rawEventId}: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
  }
}
