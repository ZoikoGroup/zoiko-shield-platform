/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, Logger } from '@nestjs/common';
import { KafkaProducerService } from '../../kafka/kafka.producer.service';
import { EntraNormalizerService } from './entra.normalizer';

@Injectable()
export class EntraEventHubConsumer {
  private readonly logger = new Logger(EntraEventHubConsumer.name);

  constructor(
    private readonly normalizer: EntraNormalizerService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  /**
   * STUB: Azure Event Hubs Consumer.
   * As per the ZoikoShield Connector Research PDF (Section 11 / High Volume),
   * polling Graph API for massive tenants is too slow.
   *
   * In a future iteration, this class will connect to a customer's Azure Event Hub
   * using @azure/event-hubs to stream high-volume logs directly into our normalizer and Kafka.
   */
  startConsuming(_connectionString: string, _eventHubName: string) {
    this.logger.warn(
      'Azure Event Hubs consumer is currently stubbed out for future high-volume iterations.',
    );
    // TODO: Implement EventHubConsumerClient
  }
}
