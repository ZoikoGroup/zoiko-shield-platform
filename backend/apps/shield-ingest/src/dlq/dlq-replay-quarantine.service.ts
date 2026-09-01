import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';

export interface QuarantinedMessage {
  messageId: string;
  tenantId: string;
  topic: string;
  originalPayload: Record<string, any>;
  errorCode: string;
  errorReason: string;
  attemptCount: number;
  maxAttempts: number;
  status: 'QUARANTINED' | 'REPLAY_SUCCESS' | 'REPLAY_FAILED' | 'PURGED';
  quarantinedAt: string;
  lastAttemptAt?: string;
  payloadDigest: string;
}

export interface ReplayResult {
  messageId: string;
  success: boolean;
  status: 'REPLAY_SUCCESS' | 'REPLAY_FAILED';
  replayedAt: string;
  error?: string;
}

export interface DlqMetrics {
  totalQuarantined: number;
  activeQuarantined: number;
  replayedSuccess: number;
  replayedFailed: number;
}

@Injectable()
export class DlqReplayQuarantineService {
  private readonly logger = new Logger(DlqReplayQuarantineService.name);

  // In-memory DLQ store
  private readonly quarantinedStore = new Map<string, QuarantinedMessage>();

  private totalQuarantinedCount = 0;
  private replayedSuccessCount = 0;
  private replayedFailedCount = 0;

  /**
   * Quarantines a poison / failed ingestion event to prevent consumer loop crashes.
   */
  quarantineMessage(
    tenantId: string,
    topic: string,
    originalPayload: Record<string, any>,
    errorReason: string,
    errorCode = 'SCHEMA_VALIDATION_ERROR',
    maxAttempts = 3,
  ): QuarantinedMessage {
    const payloadDigest = crypto
      .createHash('sha256')
      .update(JSON.stringify(originalPayload))
      .digest('hex');

    const messageId = `dlq-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    const record: QuarantinedMessage = {
      messageId,
      tenantId,
      topic,
      originalPayload,
      errorCode,
      errorReason,
      attemptCount: 0,
      maxAttempts,
      status: 'QUARANTINED',
      quarantinedAt: new Date().toISOString(),
      payloadDigest,
    };

    this.quarantinedStore.set(messageId, record);
    this.totalQuarantinedCount++;

    this.logger.warn(
      `☣️ [DLQ QUARANTINED] Message '${messageId}' on topic '${topic}' quarantined (Code: ${errorCode}, Reason: ${errorReason})`,
    );

    return record;
  }

  /**
   * Lists quarantined messages for a tenant.
   */
  listQuarantined(
    tenantId: string,
    filter?: { errorCode?: string; topic?: string },
  ): QuarantinedMessage[] {
    const results: QuarantinedMessage[] = [];
    for (const msg of this.quarantinedStore.values()) {
      if (msg.tenantId === tenantId && msg.status === 'QUARANTINED') {
        if (filter?.errorCode && msg.errorCode !== filter.errorCode) continue;
        if (filter?.topic && msg.topic !== filter.topic) continue;
        results.push(msg);
      }
    }
    return results;
  }

  /**
   * Replays a quarantined message with optional data patching.
   */
  async replayMessage(
    tenantId: string,
    messageId: string,
    transformHook?: (payload: Record<string, any>) => Record<string, any>,
  ): Promise<ReplayResult> {
    const msg = this.quarantinedStore.get(messageId);
    if (!msg || msg.tenantId !== tenantId) {
      throw new NotFoundException(
        `Quarantined message '${messageId}' not found for tenant '${tenantId}'`,
      );
    }

    msg.attemptCount++;
    msg.lastAttemptAt = new Date().toISOString();

    const payloadToProcess = transformHook
      ? transformHook({ ...msg.originalPayload })
      : msg.originalPayload;

    // Simulate validation/processing of the replayed payload
    const isValid =
      payloadToProcess &&
      payloadToProcess.timestamp &&
      !payloadToProcess.isCorrupt;

    if (isValid) {
      msg.status = 'REPLAY_SUCCESS';
      this.replayedSuccessCount++;
      this.logger.log(
        `✔ [DLQ REPLAY SUCCESS] Message '${messageId}' replayed successfully to topic '${msg.topic}'`,
      );
      return {
        messageId,
        success: true,
        status: 'REPLAY_SUCCESS',
        replayedAt: new Date().toISOString(),
      };
    } else {
      msg.status =
        msg.attemptCount >= msg.maxAttempts ? 'REPLAY_FAILED' : 'QUARANTINED';
      this.replayedFailedCount++;
      this.logger.error(
        `❌ [DLQ REPLAY FAILED] Message '${messageId}' failed processing on attempt ${msg.attemptCount}/${msg.maxAttempts}`,
      );
      return {
        messageId,
        success: false,
        status: 'REPLAY_FAILED',
        replayedAt: new Date().toISOString(),
        error: 'Payload schema invalid or unrecoverable without transformation',
      };
    }
  }

  /**
   * Purges a quarantined message manually.
   */
  purgeQuarantined(tenantId: string, messageId: string): boolean {
    const msg = this.quarantinedStore.get(messageId);
    if (msg && msg.tenantId === tenantId) {
      msg.status = 'PURGED';
      this.quarantinedStore.delete(messageId);
      return true;
    }
    return false;
  }

  getMetrics(): DlqMetrics {
    let active = 0;
    for (const msg of this.quarantinedStore.values()) {
      if (msg.status === 'QUARANTINED') active++;
    }
    return {
      totalQuarantined: this.totalQuarantinedCount,
      activeQuarantined: active,
      replayedSuccess: this.replayedSuccessCount,
      replayedFailed: this.replayedFailedCount,
    };
  }
}
