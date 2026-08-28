import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { RawIngestService } from '../../ingestion/raw-ingest.service';
import { TokenBucketRateLimiterService } from '../../ingestion/rate-limiter/token-bucket-limiter.service';

export interface SqsMessagePayload {
  messageId: string;
  receiptHandle: string;
  body: string;
  attributes?: Record<string, string>;
  messageAttributes?: Record<string, any>;
}

export interface SqsPollOptions {
  queueUrl: string;
  tenantId: string;
  environmentId: string;
  connectorId: string;
  region?: string;
  maxNumberOfMessages?: number;
  visibilityTimeout?: number;
  waitTimeSeconds?: number;
}

export interface SqsBatchProcessResult {
  totalReceived: number;
  processedCount: number;
  throttledCount: number;
  errorCount: number;
  deletedReceiptHandles: string[];
}

@Injectable()
export class AwsSqsIngestListener implements OnModuleDestroy {
  private readonly logger = new Logger(AwsSqsIngestListener.name);
  private isPollingActive = false;

  constructor(
    private readonly rawIngestService: RawIngestService,
    private readonly rateLimiter: TokenBucketRateLimiterService,
  ) {}

  onModuleDestroy() {
    this.stopPolling();
  }

  stopPolling(): void {
    this.isPollingActive = false;
  }

  /**
   * Processes a batch of SQS messages against rate limiter, OCSF normalizer, and raw ingestion.
   */
  async processMessageBatch(
    options: SqsPollOptions,
    messages: SqsMessagePayload[],
  ): Promise<SqsBatchProcessResult> {
    const result: SqsBatchProcessResult = {
      totalReceived: messages.length,
      processedCount: 0,
      throttledCount: 0,
      errorCount: 0,
      deletedReceiptHandles: [],
    };

    for (const msg of messages) {
      // 1. Enforce token bucket rate limiting per tenant
      const rateLimitDecision = this.rateLimiter.consume(options.tenantId, 1);
      if (!rateLimitDecision.allowed) {
        result.throttledCount++;
        this.logger.warn(
          `SQS Message ${msg.messageId} deferred due to tenant ${options.tenantId} rate limiting.`,
        );
        // Leave in SQS for visibility timeout retry
        continue;
      }

      // 2. Parse SQS payload
      let parsedPayload: any;
      try {
        parsedPayload =
          typeof msg.body === 'string' ? JSON.parse(msg.body) : msg.body;
      } catch (err: any) {
        result.errorCount++;
        this.logger.error(
          `Failed to parse SQS message ${msg.messageId} body: ${err.message}`,
        );
        // Treat as poisoned message or forward to DLQ
        continue;
      }

      // 3. Ingest through RawIngestService
      try {
        const ingestResult = await this.rawIngestService.processWebhookPayload(
          options.connectorId,
          {
            'x-tenant-id': options.tenantId,
            'x-environment-id': options.environmentId,
            'x-source-region': options.region || 'us-east-1',
          },
          parsedPayload,
        );

        if (
          ingestResult.processingStatus === 'ACCEPTED' ||
          ingestResult.processingStatus === 'DUPLICATE_IGNORED'
        ) {
          result.processedCount++;
          result.deletedReceiptHandles.push(msg.receiptHandle);
        } else {
          // Quarantined
          result.processedCount++;
          result.deletedReceiptHandles.push(msg.receiptHandle);
        }
      } catch (err: any) {
        result.errorCount++;
        this.logger.error(
          `Error ingesting SQS message ${msg.messageId}: ${err.message}`,
        );
      }
    }

    return result;
  }
}
