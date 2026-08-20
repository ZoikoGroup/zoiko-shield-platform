import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import crypto from 'crypto';

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
  reprocessedAt?: Date;
}

@Injectable()
export class QuarantineService {
  private readonly logger = new Logger(QuarantineService.name);
  private readonly quarantinedEvents = new Map<string, QuarantinedEventRecord>();

  quarantine(params: {
    tenantId: string;
    environmentId: string;
    connectorId: string;
    sourceEventId?: string;
    rawPayload: string;
    failureReason: QuarantineFailureReason;
    errorMessage: string;
  }): QuarantinedEventRecord {
    const quarantineId = `quar-${crypto.randomUUID()}`;
    const payloadHash = crypto
      .createHash('sha256')
      .update(params.rawPayload || '')
      .digest('hex');

    const record: QuarantinedEventRecord = {
      quarantineId,
      tenantId: params.tenantId,
      environmentId: params.environmentId,
      connectorId: params.connectorId,
      sourceEventId: params.sourceEventId,
      rawPayload: params.rawPayload,
      payloadHash,
      failureReason: params.failureReason,
      errorMessage: params.errorMessage,
      quarantinedAt: new Date(),
      status: 'PENDING_REVIEW',
    };

    this.quarantinedEvents.set(quarantineId, record);
    this.logger.warn(
      `⚠️ Ingestion Event Quarantined [ID: ${quarantineId}, Reason: ${params.failureReason}] for tenant ${params.tenantId}: ${params.errorMessage}`,
    );

    return record;
  }

  getQuarantinedEvent(
    tenantId: string,
    quarantineId: string,
  ): QuarantinedEventRecord {
    const record = this.quarantinedEvents.get(quarantineId);
    if (!record || record.tenantId !== tenantId) {
      throw new NotFoundException(
        `Quarantined event '${quarantineId}' not found for tenant '${tenantId}'`,
      );
    }
    return record;
  }

  listQuarantinedEvents(tenantId: string): QuarantinedEventRecord[] {
    return Array.from(this.quarantinedEvents.values()).filter(
      (r) => r.tenantId === tenantId,
    );
  }

  markReprocessed(
    tenantId: string,
    quarantineId: string,
  ): QuarantinedEventRecord {
    const record = this.getQuarantinedEvent(tenantId, quarantineId);
    record.status = 'REPROCESSED';
    record.reprocessedAt = new Date();
    this.quarantinedEvents.set(quarantineId, record);
    this.logger.log(
      `✔ Quarantined event '${quarantineId}' marked as REPROCESSED for tenant '${tenantId}'`,
    );
    return record;
  }

  discard(tenantId: string, quarantineId: string): void {
    const record = this.getQuarantinedEvent(tenantId, quarantineId);
    record.status = 'DISCARDED';
    this.quarantinedEvents.set(quarantineId, record);
    this.logger.log(
      `Quarantined event '${quarantineId}' discarded for tenant '${tenantId}'`,
    );
  }
}
