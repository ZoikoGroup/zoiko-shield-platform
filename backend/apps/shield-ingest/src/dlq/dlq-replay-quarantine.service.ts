import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import type { DlqMessage } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaProducerService } from '../kafka/kafka.producer.service';
import {
  runWithPlatformScope,
  runWithTenantScope,
} from '../../../../libs/database/src';

/** NORMALIZATION: a provider normalizer rejected the record; no automated replay route exists. */
export type DlqSourceKind =
  'WEBHOOK' | 'SQS' | 'KAFKA' | 'NORMALIZATION' | 'UNKNOWN';

export type DlqStatus =
  'QUARANTINED' | 'REPLAYING' | 'REPLAY_SUCCESS' | 'REPLAY_FAILED' | 'PURGED';

/** Where a quarantined message came from, which decides how a replay re-enters the pipeline. */
export interface DlqOrigin {
  kind: DlqSourceKind;
  connectorId?: string;
  environmentId?: string;
  sourceRegion?: string;
  kafka?: { topic: string; partition?: number; offset?: string };
}

export interface QuarantinedMessage {
  messageId: string;
  tenantId: string;
  topic: string;
  sourceKind: DlqSourceKind;
  connectorId?: string;
  environmentId?: string;
  originalPayload: Record<string, any>;
  errorCode: string;
  errorReason: string;
  attemptCount: number;
  maxAttempts: number;
  status: DlqStatus;
  quarantinedAt: string;
  lastAttemptAt?: string;
  lastError?: string;
  payloadDigest: string;
}

export interface ReplayResult {
  messageId: string;
  success: boolean;
  status: 'REPLAY_SUCCESS' | 'REPLAY_FAILED' | 'QUARANTINED';
  replayedAt: string;
  error?: string;
  /** Another replay holds the claim, or the message is no longer replayable. */
  skipped?: boolean;
}

export interface DlqMetrics {
  totalQuarantined: number;
  activeQuarantined: number;
  replayedSuccess: number;
  replayedFailed: number;
}

/** Re-runs a payload through ingestion; RawIngestService registers itself as this. */
export type DlqReingestHandler = (
  connectorId: string,
  headers: Record<string, string>,
  payload: Record<string, any>,
) => Promise<{ processingStatus: string }>;

/** A REPLAYING claim older than this is treated as abandoned by a crashed worker. */
const STALE_REPLAY_CLAIM_MS = 5 * 60 * 1000;

const ACTIVE_STATUSES: DlqStatus[] = ['QUARANTINED', 'REPLAYING'];

@Injectable()
export class DlqReplayQuarantineService {
  private readonly logger = new Logger(DlqReplayQuarantineService.name);
  private reingest?: DlqReingestHandler;

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  /**
   * RawIngestService injects this service, so it hands its ingest entry point
   * over at construction rather than this service importing it back.
   */
  setReingestHandler(handler: DlqReingestHandler): void {
    this.reingest = handler;
  }

  /**
   * Quarantines a poison / failed ingestion event to prevent consumer loop crashes.
   * The same payload from the same source is quarantined once while it is
   * still active, so a failed replay does not multiply records.
   */
  async quarantineMessage(
    tenantId: string,
    topic: string,
    originalPayload: Record<string, any>,
    errorReason: string,
    errorCode = 'SCHEMA_VALIDATION_ERROR',
    maxAttempts = 3,
    origin: DlqOrigin = { kind: 'UNKNOWN' },
  ): Promise<QuarantinedMessage> {
    const serialized = JSON.stringify(originalPayload ?? null);
    const payloadDigest = crypto
      .createHash('sha256')
      .update(serialized)
      .digest('hex');

    return runWithTenantScope(tenantId, async () => {
      const existing = await this.prisma.dlqMessage.findFirst({
        where: {
          tenant_id: tenantId,
          source: topic,
          payload_digest: payloadDigest,
          status: { in: ACTIVE_STATUSES },
        },
      });
      if (existing) return this.toMessage(existing);

      const row = await this.prisma.dlqMessage.create({
        data: {
          tenant_id: tenantId,
          message_id: `dlq-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
          source_kind: origin.kind,
          source: topic,
          connector_id: origin.connectorId,
          environment_id: origin.environmentId,
          source_region: origin.sourceRegion,
          kafka_topic: origin.kafka?.topic,
          kafka_partition: origin.kafka?.partition,
          kafka_offset: origin.kafka?.offset,
          original_payload: serialized,
          payload_digest: payloadDigest,
          error_code: errorCode,
          error_reason: errorReason,
          max_attempts: maxAttempts,
          status: 'QUARANTINED',
        },
      });

      this.logger.warn(
        `☣️ [DLQ QUARANTINED] Message '${row.message_id}' on '${topic}' quarantined (Code: ${errorCode}, Reason: ${errorReason})`,
      );

      return this.toMessage(row);
    });
  }

  /**
   * Lists quarantined messages for a tenant.
   */
  async listQuarantined(
    tenantId: string,
    filter?: {
      errorCode?: string;
      topic?: string;
      sourceKinds?: DlqSourceKind[];
    },
  ): Promise<QuarantinedMessage[]> {
    const rows = await runWithTenantScope(tenantId, () =>
      this.prisma.dlqMessage.findMany({
        where: {
          tenant_id: tenantId,
          status: 'QUARANTINED',
          ...(filter?.errorCode ? { error_code: filter.errorCode } : {}),
          ...(filter?.topic ? { source: filter.topic } : {}),
          ...(filter?.sourceKinds
            ? { source_kind: { in: filter.sourceKinds } }
            : {}),
        },
        orderBy: { quarantined_at: 'asc' },
      }),
    );
    return rows.map((row) => this.toMessage(row));
  }

  async getMessage(
    tenantId: string,
    messageId: string,
  ): Promise<QuarantinedMessage> {
    const row = await runWithTenantScope(tenantId, () =>
      this.prisma.dlqMessage.findFirst({
        where: { tenant_id: tenantId, message_id: messageId },
      }),
    );
    if (!row) {
      throw new NotFoundException(
        `Quarantined message '${messageId}' not found for tenant '${tenantId}'`,
      );
    }
    return this.toMessage(row);
  }

  /** Tenants holding quarantined messages of the given kinds, for scheduled sweeps. */
  async listTenantsWithQuarantine(
    sourceKinds: DlqSourceKind[],
  ): Promise<string[]> {
    const rows = await runWithPlatformScope(
      'DLQ sweep: tenants with quarantined messages',
      () =>
        this.prisma.dlqMessage.findMany({
          where: { status: 'QUARANTINED', source_kind: { in: sourceKinds } },
          distinct: ['tenant_id'],
          select: { tenant_id: true },
        }),
    );
    return rows.map((row) => row.tenant_id);
  }

  /**
   * Replays a quarantined message with optional data patching.
   *
   * The message is first claimed with a conditional update, so concurrent
   * replays of one message run it once. Status moves to REPLAY_SUCCESS only
   * after the pipeline has actually accepted the payload; a message that has
   * already been replayed successfully is never sent again.
   */
  async replayMessage(
    tenantId: string,
    messageId: string,
    transformHook?: (payload: Record<string, any>) => Record<string, any>,
  ): Promise<ReplayResult> {
    return runWithTenantScope(tenantId, async () => {
      const msg = await this.prisma.dlqMessage.findFirst({
        where: { tenant_id: tenantId, message_id: messageId },
      });
      if (!msg) {
        throw new NotFoundException(
          `Quarantined message '${messageId}' not found for tenant '${tenantId}'`,
        );
      }

      if (msg.status === 'REPLAY_SUCCESS') {
        return {
          messageId,
          success: true,
          status: 'REPLAY_SUCCESS',
          replayedAt: (
            msg.replayed_at ??
            msg.last_attempt_at ??
            new Date()
          ).toISOString(),
        };
      }

      const now = new Date();
      const claim = await this.prisma.dlqMessage.updateMany({
        where: {
          tenant_id: tenantId,
          message_id: messageId,
          OR: [
            { status: 'QUARANTINED' },
            {
              status: 'REPLAYING',
              last_attempt_at: {
                lt: new Date(now.getTime() - STALE_REPLAY_CLAIM_MS),
              },
            },
          ],
        },
        data: {
          status: 'REPLAYING',
          attempt_count: { increment: 1 },
          last_attempt_at: now,
        },
      });
      if (claim.count !== 1) {
        return {
          ...this.failure(
            messageId,
            msg.status === 'REPLAYING' ? 'QUARANTINED' : 'REPLAY_FAILED',
            `Message is ${msg.status}; it is not available for replay`,
          ),
          skipped: true,
        };
      }

      const attempt = msg.attempt_count + 1;
      const original = JSON.parse(msg.original_payload) as Record<string, any>;
      const payload = transformHook ? transformHook({ ...original }) : original;

      let error: string | undefined;
      try {
        error = await this.redeliver(msg, payload);
      } catch (err) {
        error = (err as Error).message || 'Unknown replay error';
      }

      if (!error) {
        await this.prisma.dlqMessage.updateMany({
          where: {
            tenant_id: tenantId,
            message_id: messageId,
            status: 'REPLAYING',
          },
          data: {
            status: 'REPLAY_SUCCESS',
            replayed_at: new Date(),
            last_error: null,
          },
        });
        this.logger.log(
          `✔ [DLQ REPLAY SUCCESS] Message '${messageId}' re-entered the pipeline via ${msg.source_kind}`,
        );
        return {
          messageId,
          success: true,
          status: 'REPLAY_SUCCESS',
          replayedAt: new Date().toISOString(),
        };
      }

      const next: DlqStatus =
        attempt >= msg.max_attempts ? 'REPLAY_FAILED' : 'QUARANTINED';
      await this.prisma.dlqMessage.updateMany({
        where: {
          tenant_id: tenantId,
          message_id: messageId,
          status: 'REPLAYING',
        },
        data: { status: next, last_error: error.slice(0, 500) },
      });
      this.logger.error(
        `❌ [DLQ REPLAY FAILED] Message '${messageId}' failed on attempt ${attempt}/${msg.max_attempts}: ${error}`,
      );
      return this.failure(
        messageId,
        next === 'REPLAY_FAILED' ? 'REPLAY_FAILED' : 'QUARANTINED',
        error,
      );
    });
  }

  /**
   * Purges a quarantined message manually. The row is kept as PURGED so the
   * decision to discard telemetry stays auditable.
   */
  async purgeQuarantined(
    tenantId: string,
    messageId: string,
  ): Promise<boolean> {
    const { count } = await runWithTenantScope(tenantId, () =>
      this.prisma.dlqMessage.updateMany({
        where: {
          tenant_id: tenantId,
          message_id: messageId,
          status: { in: ['QUARANTINED', 'REPLAY_FAILED'] },
        },
        data: { status: 'PURGED' },
      }),
    );
    return count === 1;
  }

  /** Counts for one tenant, or across tenants when none is given. */
  async getMetrics(tenantId?: string): Promise<DlqMetrics> {
    const count = async () => {
      const where = tenantId ? { tenant_id: tenantId } : {};
      const [total, active, success, failed] = await Promise.all([
        this.prisma.dlqMessage.count({ where }),
        this.prisma.dlqMessage.count({
          where: { ...where, status: { in: ACTIVE_STATUSES } },
        }),
        this.prisma.dlqMessage.count({
          where: { ...where, status: 'REPLAY_SUCCESS' },
        }),
        this.prisma.dlqMessage.count({
          where: { ...where, status: 'REPLAY_FAILED' },
        }),
      ]);
      return {
        totalQuarantined: total,
        activeQuarantined: active,
        replayedSuccess: success,
        replayedFailed: failed,
      };
    };
    return tenantId
      ? runWithTenantScope(tenantId, count)
      : runWithPlatformScope('DLQ metrics aggregated across tenants', count);
  }

  /** Returns an error message, or undefined once the pipeline has accepted the payload. */
  private async redeliver(
    msg: DlqMessage,
    payload: Record<string, any>,
  ): Promise<string | undefined> {
    switch (msg.source_kind) {
      case 'KAFKA': {
        if (!msg.kafka_topic) return 'Kafka origin has no topic recorded';
        await this.kafkaProducer.republish(
          msg.kafka_topic,
          msg.tenant_id,
          payload,
        );
        return undefined;
      }
      case 'WEBHOOK':
      case 'SQS': {
        if (!msg.connector_id) return 'No connector recorded for re-ingest';
        if (!this.reingest) return 'No re-ingest path is registered';
        const headers: Record<string, string> = {
          'x-tenant-id': msg.tenant_id,
        };
        if (msg.environment_id)
          headers['x-environment-id'] = msg.environment_id;
        if (msg.source_region) headers['x-source-region'] = msg.source_region;
        const result = await this.reingest(msg.connector_id, headers, payload);
        // DUPLICATE_IGNORED is not success: the quarantined copy is itself
        // recorded as a raw event, so an unchanged replay matches it and
        // nothing new enters the pipeline.
        return result.processingStatus === 'ACCEPTED'
          ? undefined
          : `Re-ingest returned ${result.processingStatus}`;
      }
      case 'NORMALIZATION':
        return 'Normalizer rejected this record; it needs a normalizer fix, not a replay';
      default:
        return `No replay route for source kind '${msg.source_kind}'`;
    }
  }

  private failure(
    messageId: string,
    status: 'REPLAY_FAILED' | 'QUARANTINED',
    error: string,
  ): ReplayResult {
    return {
      messageId,
      success: false,
      status,
      replayedAt: new Date().toISOString(),
      error,
    };
  }

  private toMessage(row: DlqMessage): QuarantinedMessage {
    return {
      messageId: row.message_id,
      tenantId: row.tenant_id,
      topic: row.source,
      sourceKind: row.source_kind as DlqSourceKind,
      connectorId: row.connector_id ?? undefined,
      environmentId: row.environment_id ?? undefined,
      originalPayload: JSON.parse(row.original_payload),
      errorCode: row.error_code,
      errorReason: row.error_reason,
      attemptCount: row.attempt_count,
      maxAttempts: row.max_attempts,
      status: row.status as DlqStatus,
      quarantinedAt: row.quarantined_at.toISOString(),
      lastAttemptAt: row.last_attempt_at?.toISOString(),
      lastError: row.last_error ?? undefined,
      payloadDigest: row.payload_digest,
    };
  }
}
