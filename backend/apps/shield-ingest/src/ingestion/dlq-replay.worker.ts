import { Injectable, Logger } from '@nestjs/common';
import {
  QuarantineService,
  QuarantinedEventRecord,
} from './quarantine.service';
import { RawIngestService } from './raw-ingest.service';

export interface DLQReplayBatchResult {
  totalProcessed: number;
  replayedCount: number;
  failedCount: number;
  skippedCount: number;
  errors: Array<{ quarantineId: string; error: string }>;
}

@Injectable()
export class DLQReplayWorker {
  private readonly logger = new Logger(DLQReplayWorker.name);

  constructor(
    private readonly quarantineService: QuarantineService,
    private readonly rawIngestService: RawIngestService,
  ) {}

  async replayQuarantineBatch(
    tenantId: string,
    limit = 50,
  ): Promise<DLQReplayBatchResult> {
    this.logger.log(
      `Starting DLQ replay run for tenant=${tenantId}, limit=${limit}`,
    );

    const allQuarantined =
      this.quarantineService.listQuarantinedEvents(tenantId);
    const pendingEvents = allQuarantined
      .filter((e) => e.status === 'PENDING_REVIEW')
      .slice(0, limit);

    const result: DLQReplayBatchResult = {
      totalProcessed: pendingEvents.length,
      replayedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      errors: [],
    };

    for (const record of pendingEvents) {
      try {
        let parsedPayload: any;
        try {
          parsedPayload = JSON.parse(record.rawPayload);
        } catch (jsonErr: any) {
          result.failedCount++;
          result.errors.push({
            quarantineId: record.quarantineId,
            error: `JSON parse failure: ${jsonErr.message}`,
          });
          continue;
        }

        const ingestResult = await this.rawIngestService.processWebhookPayload(
          record.connectorId,
          {
            'x-tenant-id': tenantId,
            'x-environment-id': record.environmentId,
          },
          parsedPayload,
        );

        if (
          ingestResult.processingStatus === 'ACCEPTED' ||
          ingestResult.processingStatus === 'DUPLICATE_IGNORED'
        ) {
          this.quarantineService.markReprocessed(tenantId, record.quarantineId);
          result.replayedCount++;
          this.logger.log(
            `Successfully replayed DLQ event ${record.quarantineId} for tenant ${tenantId}`,
          );
        } else {
          result.failedCount++;
          result.errors.push({
            quarantineId: record.quarantineId,
            error: `Re-ingest returned status ${ingestResult.processingStatus}`,
          });
        }
      } catch (err: any) {
        result.failedCount++;
        result.errors.push({
          quarantineId: record.quarantineId,
          error: err.message || 'Unknown replay error',
        });
        this.logger.error(
          `Failed to replay DLQ event ${record.quarantineId}: ${err.message}`,
          err.stack,
        );
      }
    }

    this.logger.log(
      `DLQ replay completed for tenant=${tenantId}: ${result.replayedCount}/${result.totalProcessed} replayed`,
    );

    return result;
  }
}
