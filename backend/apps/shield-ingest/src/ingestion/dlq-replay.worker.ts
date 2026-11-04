import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  DlqReplayQuarantineService,
  DlqSourceKind,
} from '../dlq/dlq-replay-quarantine.service';
import { PlatformScope } from '../../../../libs/database/src';

export interface DLQReplayBatchResult {
  totalProcessed: number;
  replayedCount: number;
  failedCount: number;
  skippedCount: number;
  errors: Array<{ quarantineId: string; error: string }>;
}

/**
 * Only these kinds can succeed unattended. A WEBHOOK copy is already recorded
 * as a raw event, so an unchanged re-ingest is DUPLICATE_IGNORED; NORMALIZATION
 * rows need a normalizer fix. Both wait for an operator-driven replay.
 */
const AUTO_REPLAY_KINDS: DlqSourceKind[] = ['SQS', 'KAFKA'];

@Injectable()
export class DLQReplayWorker {
  private readonly logger = new Logger(DLQReplayWorker.name);
  private isProcessing = false;

  constructor(private readonly dlq: DlqReplayQuarantineService) {}

  /**
   * Automated DLQ Auto-Retry Cron (OPS-INV-13 Specification)
   * Runs every 30 seconds to automatically retry quarantined messages.
   */
  @PlatformScope('scheduled job DLQReplayWorker.autoRetryQuarantinedWorker')
  @Cron(CronExpression.EVERY_30_SECONDS)
  async autoRetryQuarantinedWorker(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    // Yield to the event loop so concurrent callers see the guard before we proceed.
    await Promise.resolve();

    try {
      const tenants =
        await this.dlq.listTenantsWithQuarantine(AUTO_REPLAY_KINDS);
      for (const tenantId of tenants) {
        await this.replayQuarantineBatch(tenantId, 25);
      }
    } catch (err: any) {
      this.logger.error(
        `Error in automated DLQ auto-retry worker: ${err.message}`,
      );
    } finally {
      this.isProcessing = false;
    }
  }

  async replayQuarantineBatch(
    tenantId: string,
    limit = 50,
  ): Promise<DLQReplayBatchResult> {
    const pending = (
      await this.dlq.listQuarantined(tenantId, {
        sourceKinds: AUTO_REPLAY_KINDS,
      })
    ).slice(0, limit);

    const result: DLQReplayBatchResult = {
      totalProcessed: pending.length,
      replayedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      errors: [],
    };

    for (const message of pending) {
      try {
        const replay = await this.dlq.replayMessage(
          tenantId,
          message.messageId,
        );
        if (replay.skipped) {
          result.skippedCount++;
        } else if (replay.success) {
          result.replayedCount++;
        } else {
          result.failedCount++;
          result.errors.push({
            quarantineId: message.messageId,
            error: replay.error ?? 'Replay failed',
          });
        }
      } catch (err: any) {
        result.failedCount++;
        result.errors.push({
          quarantineId: message.messageId,
          error: err.message || 'Unknown replay error',
        });
      }
    }

    if (pending.length > 0) {
      this.logger.log(
        `DLQ replay completed for tenant=${tenantId}: ${result.replayedCount}/${result.totalProcessed} replayed, ${result.failedCount} failed, ${result.skippedCount} skipped`,
      );
    }

    return result;
  }
}
