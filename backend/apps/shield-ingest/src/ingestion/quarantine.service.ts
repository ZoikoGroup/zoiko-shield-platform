import { Injectable, Logger } from '@nestjs/common';
import crypto from 'crypto';
import {
  DlqReplayQuarantineService,
  QuarantinedMessage,
} from '../dlq/dlq-replay-quarantine.service';

export type QuarantineFailureReason =
  | 'SCHEMA_MISMATCH'
  | 'PARSER_EXCEPTION'
  | 'INVALID_TIMESTAMP'
  | 'UNSUPPORTED_VERSION'
  | 'UNKNOWN';

export interface QuarantinedEventRecord {
  quarantineId: string;
  tenantId: string;
  environmentId: string;
  connectorId: string;
  sourceEventId?: string;
  rawPayload: string;
  payloadHash: string;
  failureReason: QuarantineFailureReason;
  errorMessage: string;
  quarantinedAt: Date;
  status: 'PENDING_REVIEW' | 'REPROCESSED' | 'DISCARDED';
}

const SOURCE_PREFIX = 'normalization:';

/**
 * Normalizer rejections, stored in ingest.DlqMessage as NORMALIZATION rows.
 * connectorId here is a provider slug, not a connector instance, so it is kept
 * in `source` and never used as a re-ingest route: these need a normalizer
 * fix, not an automated replay.
 */
@Injectable()
export class QuarantineService {
  private readonly logger = new Logger(QuarantineService.name);

  constructor(private readonly dlq: DlqReplayQuarantineService) {}

  async quarantine(params: {
    tenantId: string;
    environmentId: string;
    connectorId: string;
    sourceEventId?: string;
    rawPayload: string;
    failureReason: QuarantineFailureReason;
    errorMessage: string;
  }): Promise<QuarantinedEventRecord> {
    const message = await this.dlq.quarantineMessage(
      params.tenantId,
      `${SOURCE_PREFIX}${params.connectorId}`,
      { rawPayload: params.rawPayload, sourceEventId: params.sourceEventId },
      params.errorMessage,
      params.failureReason,
      1,
      { kind: 'NORMALIZATION', environmentId: params.environmentId },
    );
    this.logger.warn(
      `⚠️ Ingestion Event Quarantined [ID: ${message.messageId}, Reason: ${params.failureReason}] for tenant ${params.tenantId}: ${params.errorMessage}`,
    );
    return this.toRecord(message);
  }

  quarantinePayload(
    tenantId: string,
    environmentId: string,
    connectorId: string,
    rawPayload: string,
    failureReason: QuarantineFailureReason | string,
    errorMessage: string,
  ): Promise<QuarantinedEventRecord> {
    return this.quarantine({
      tenantId,
      environmentId,
      connectorId,
      rawPayload,
      failureReason:
        (failureReason as QuarantineFailureReason) || 'SCHEMA_MISMATCH',
      errorMessage,
    });
  }

  async getQuarantinedEvent(
    tenantId: string,
    quarantineId: string,
  ): Promise<QuarantinedEventRecord> {
    return this.toRecord(await this.dlq.getMessage(tenantId, quarantineId));
  }

  async listQuarantinedEvents(
    tenantId: string,
  ): Promise<QuarantinedEventRecord[]> {
    const messages = await this.dlq.listQuarantined(tenantId, {
      sourceKinds: ['NORMALIZATION'],
    });
    return messages.map((m) => this.toRecord(m));
  }

  async discard(tenantId: string, quarantineId: string): Promise<void> {
    await this.dlq.purgeQuarantined(tenantId, quarantineId);
    this.logger.log(
      `Quarantined event '${quarantineId}' discarded for tenant '${tenantId}'`,
    );
  }

  private toRecord(message: QuarantinedMessage): QuarantinedEventRecord {
    const payload = message.originalPayload as {
      rawPayload?: string;
      sourceEventId?: string;
    };
    const rawPayload = payload?.rawPayload ?? '';
    return {
      quarantineId: message.messageId,
      tenantId: message.tenantId,
      environmentId: message.environmentId ?? '',
      connectorId: message.topic.startsWith(SOURCE_PREFIX)
        ? message.topic.slice(SOURCE_PREFIX.length)
        : message.topic,
      sourceEventId: payload?.sourceEventId,
      rawPayload,
      payloadHash: crypto.createHash('sha256').update(rawPayload).digest('hex'),
      failureReason: message.errorCode as QuarantineFailureReason,
      errorMessage: message.errorReason,
      quarantinedAt: new Date(message.quarantinedAt),
      status:
        message.status === 'PURGED'
          ? 'DISCARDED'
          : message.status === 'REPLAY_SUCCESS'
            ? 'REPROCESSED'
            : 'PENDING_REVIEW',
    };
  }
}
