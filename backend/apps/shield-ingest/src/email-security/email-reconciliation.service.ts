import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Microsoft365EmailProvider } from '../connectors/providers/microsoft-365-email/m365-email.provider';
import { M365EmailNormalizerService } from '../connectors/providers/microsoft-365-email/m365-email.normalizer';
import { GoogleWorkspaceAlertCenterProvider } from '../connectors/providers/google-workspace-alert-center/gw-alert-center.provider';
import type { NormalizedEmailThreatRecord } from '../connectors/providers/microsoft-365-email/m365-email.types';

const MAX_BACKFILL_DAYS = 90;

/**
 * shield-ingest Email Security normalization, connectivity check & DLQ service for
 * ZoikoShield supported providers (Microsoft 365 Graph `/security/alerts_v2` and Google Workspace Alert Center).
 * Writes strictly within `ingest` schema (`DlqMessage`).
 */
@Injectable()
export class EmailReconciliationService {
  private readonly logger = new Logger(EmailReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly m365Provider: Microsoft365EmailProvider,
    private readonly m365Normalizer: M365EmailNormalizerService,
    private readonly gwProvider: GoogleWorkspaceAlertCenterProvider,
  ) {}

  async testConnection(tenantId: string, connectionId: string) {
    const connection = await this.prisma.emailSourceConnection.findFirst({
      where: { id: connectionId, tenant_id: tenantId },
    });
    if (!connection) {
      throw new NotFoundException(`Email source '${connectionId}' not found`);
    }
    if (connection.status === 'REVOKED') {
      return {
        status: 'PERMISSION_REVOKED',
        lastCheckedAt: new Date().toISOString(),
        reason: 'Access grant was revoked by tenant administrator',
      };
    }

    const ctx = {
      connectorInstanceId: connection.id,
      tenantId,
      environmentId: connection.environment_id,
      region: connection.residency_code,
      purpose: 'email-security-verification',
      correlationId: `verify-${connection.id}`,
      traceId: `verify-${connection.id}`,
    };

    if (connection.provider === 'MICROSOFT_365') {
      return this.m365Provider.testConnection(ctx);
    }
    if (connection.provider === 'GOOGLE_WORKSPACE') {
      return this.gwProvider.testConnection(ctx);
    }
    return {
      status: 'UNVERIFIED',
      lastCheckedAt: new Date().toISOString(),
      reason: `Unsupported email provider '${connection.provider}'`,
    };
  }

  async syncRecords(
    tenantId: string,
    connectionId: string,
    rawEvents: unknown[],
    options: { expectedCount?: number; simulateRateLimit?: boolean } = {},
  ) {
    const connection = await this.prisma.emailSourceConnection.findFirst({
      where: { id: connectionId, tenant_id: tenantId },
    });
    if (!connection) {
      throw new NotFoundException(`Email source '${connectionId}' not found`);
    }
    if (connection.status === 'REVOKED' || connection.status === 'SUSPENDED') {
      throw new ForbiddenException(
        `Collection halted: connection '${connectionId}' is ${connection.status}`,
      );
    }

    const now = new Date();
    const windowStart = new Date(Math.floor(now.getTime() / 3600000) * 3600000);
    const windowEnd = new Date(windowStart.getTime() + 3600000);

    if (options.simulateRateLimit) {
      return {
        status: 'DEGRADED',
        ingestedCount: 0,
        duplicateCount: 0,
        rejectedCount: 0,
        missingCount: options.expectedCount ?? rawEvents.length,
        normalizedRecords: [] as NormalizedEmailThreatRecord[],
        gaps: [
          {
            reason: 'PROVIDER_429_RATE_LIMITED',
            windowStart: windowStart.toISOString(),
            windowEnd: windowEnd.toISOString(),
          },
        ],
      };
    }

    const ctx = {
      connectorInstanceId: connection.id,
      tenantId,
      environmentId: connection.environment_id,
      region: connection.residency_code,
      purpose: 'email-security-sync',
      correlationId: `sync-${connection.id}`,
      traceId: `sync-${connection.id}`,
    };

    const normalizedRecords: NormalizedEmailThreatRecord[] = [];
    const gaps: Array<{ reason: string; detail: string }> = [];
    let rejectedCount = 0;

    for (const raw of rawEvents) {
      let normalized: NormalizedEmailThreatRecord | null = null;
      if (connection.provider === 'MICROSOFT_365') {
        normalized = this.m365Normalizer.normalizeAlert(raw, ctx);
      } else if (connection.provider === 'GOOGLE_WORKSPACE') {
        normalized = this.gwProvider.normalizeAlert(raw, ctx);
      }

      if (!normalized) {
        rejectedCount += 1;
        gaps.push({
          reason: 'SCHEMA_VALIDATION_REJECTED',
          detail: 'Malformed provider payload routed fail-closed to DLQ',
        });
        const payloadText = JSON.stringify(
          raw && typeof raw === 'object' ? raw : { raw },
        );
        const payloadDigest = createHash('sha256')
          .update(payloadText, 'utf8')
          .digest('hex');
        await this.prisma.dlqMessage.create({
          data: {
            tenant_id: tenantId,
            message_id: `email-dlq-${randomUUID()}`,
            source_kind: 'WEBHOOK',
            source: `email.ingest.${connection.provider.toLowerCase()}`,
            connector_id: connection.id,
            environment_id: connection.environment_id,
            source_region: connection.residency_code,
            original_payload: payloadText,
            payload_digest: payloadDigest,
            error_code: 'EMAIL_SCHEMA_REJECTED',
            error_reason:
              'Malformed provider payload rejected by fail-closed schema validation',
            status: 'QUARANTINED',
          },
        });
        continue;
      }

      normalizedRecords.push(normalized);
    }

    const expectedCount = options.expectedCount ?? rawEvents.length;
    const isDegraded = rejectedCount > 0;

    return {
      status: isDegraded ? 'DEGRADED' : 'HEALTHY_SYNCED',
      ingestedCount: normalizedRecords.length,
      expectedCount,
      rejectedCount,
      normalizedRecords,
      gaps,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
    };
  }

  async getSourceHealth(tenantId: string, connectionId: string) {
    const connection = await this.prisma.emailSourceConnection.findFirst({
      where: { id: connectionId, tenant_id: tenantId },
    });
    if (!connection) {
      throw new NotFoundException(`Email source '${connectionId}' not found`);
    }
    const windows = await this.prisma.sourceCoverageWindow.findMany({
      // tenant_id scoped below
      where: { tenant_id: tenantId, connection_id: connection.id },
      orderBy: { window_end: 'desc' },
      take: 24,
    });
    const latest = windows[0];
    return {
      connectionId: connection.id,
      provider: connection.provider,
      status: connection.status,
      sourceHealth:
        connection.status === 'REVOKED'
          ? 'UNAVAILABLE'
          : latest?.source_health || 'UNAVAILABLE',
      lastHeartbeatAt: connection.last_heartbeat_at,
      lastSyncAt: connection.last_sync_at,
      windows,
    };
  }

  async requestBackfill(
    tenantId: string,
    connectionId: string,
    actorId: string,
    windowStartIso: string,
    windowEndIso: string,
    reason: string,
  ) {
    const startMs = Date.parse(windowStartIso);
    const endMs = Date.parse(windowEndIso);
    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      endMs <= startMs
    ) {
      throw new BadRequestException(
        'Bounded backfill requires valid ISO timestamps with windowEnd > windowStart',
      );
    }
    const spanDays = (endMs - startMs) / (1000 * 60 * 60 * 24);
    if (spanDays > MAX_BACKFILL_DAYS) {
      throw new BadRequestException(
        `Backfill window exceeds maximum bounded interval of ${MAX_BACKFILL_DAYS} days (no unbounded historical read permitted)`,
      );
    }

    const connection = await this.prisma.emailSourceConnection.findFirst({
      where: { id: connectionId, tenant_id: tenantId },
    });
    if (!connection || connection.status === 'REVOKED') {
      throw new ForbiddenException(
        'Cannot run backfill for missing or revoked email connection',
      );
    }

    this.logger.log(
      `Validated bounded email backfill request for tenant=${tenantId} connection=${connection.id} actor=${actorId}`,
    );

    return {
      accepted: true,
      connectionId: connection.id,
      windowStart: windowStartIso,
      windowEnd: windowEndIso,
      reason,
      status: 'QUEUED',
    };
  }
}
