import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { RawIngestService } from '../../ingestion/raw-ingest.service';
import { TokenBucketRateLimiterService } from '../../ingestion/rate-limiter/token-bucket-limiter.service';

export interface EventHubReceivedEventData {
  body: any;
  sequenceNumber: number;
  offset: string;
  enqueuedTimeUtc: Date;
  partitionKey?: string;
  properties?: Record<string, any>;
  systemProperties?: Record<string, any>;
}

export interface EventHubConsumerOptions {
  eventHubName: string;
  consumerGroup?: string;
  partitionId: string;
  tenantId: string;
  environmentId: string;
  connectorId: string;
  region?: string;
}

export interface EventHubBatchResult {
  partitionId: string;
  totalReceived: number;
  processedCount: number;
  throttledCount: number;
  lastSequenceNumber?: number;
}

@Injectable()
export class AzureEventHubsIngestListener implements OnModuleDestroy {
  private readonly logger = new Logger(AzureEventHubsIngestListener.name);
  private isListening = false;

  constructor(
    private readonly rawIngestService: RawIngestService,
    private readonly rateLimiter: TokenBucketRateLimiterService,
  ) {}

  onModuleDestroy() {
    this.stop();
  }

  stop(): void {
    this.isListening = false;
  }

  /**
   * Processes a partitioned batch of events from Azure EventHubs.
   */
  async processPartitionBatch(
    options: EventHubConsumerOptions,
    events: EventHubReceivedEventData[],
  ): Promise<EventHubBatchResult> {
    const result: EventHubBatchResult = {
      partitionId: options.partitionId,
      totalReceived: events.length,
      processedCount: 0,
      throttledCount: 0,
    };

    for (const event of events) {
      // 1. Check rate limit
      const decision = this.rateLimiter.consume(options.tenantId, 1);
      if (!decision.allowed) {
        result.throttledCount++;
        this.logger.warn(
          `Azure EventHubs event seq=${event.sequenceNumber} on partition=${options.partitionId} throttled for tenant=${options.tenantId}`,
        );
        continue;
      }

      // 2. Normalize and Ingest
      try {
        const parsedPayload =
          typeof event.body === 'string' ? JSON.parse(event.body) : event.body;

        await this.rawIngestService.processWebhookPayload(
          options.connectorId,
          {
            'x-tenant-id': options.tenantId,
            'x-environment-id': options.environmentId,
            'x-source-region': options.region || 'westeurope',
          },
          parsedPayload,
        );

        result.processedCount++;
        result.lastSequenceNumber = event.sequenceNumber;
      } catch (err: any) {
        this.logger.error(
          `Error ingesting EventHub event seq=${event.sequenceNumber}: ${err.message}`,
        );
      }
    }

    return result;
  }
}
