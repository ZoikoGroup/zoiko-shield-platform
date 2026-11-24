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
const DEFAULT_SYNC_PAGES = 5;
const MAX_SYNC_PAGES = 20;
const ISO_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;

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

  async testConnection(
    tenantId: string,
    connectionId: string,
    accessToken?: string,
  ) {
    const connection = await this.prisma.emailSourceConnection.findFirst({
      where: { id: connectionId, tenant_id: tenantId },
    });
    if (!connection) {
      throw new NotFoundException(`Email source '${connectionId}' not found`);
    }
    if (connection.status === 'REVOKED' || connection.status === 'SUSPENDED') {
      return {
        status: 'PERMISSION_REVOKED',
        lastCheckedAt: new Date().toISOString(),
        reason: `Connection is ${connection.status}; collection is halted`,
        capabilityReport: this.capabilityReport(
          connection.provider,
          'PERMISSION_REVOKED',
        ),
      };
    }

    const ctx = this.contextFor(
      tenantId,
      connection,
      'email-security-verification',
    );

    let health: { status: string; [key: string]: unknown };
    if (connection.provider === 'MICROSOFT_365') {
      health = await this.m365Provider.testConnection(ctx, accessToken);
    } else if (connection.provider === 'GOOGLE_WORKSPACE') {
      health = await this.gwProvider.testConnection(ctx, accessToken);
    } else {
      health = {
        status: 'UNVERIFIED',
        lastCheckedAt: new Date().toISOString(),
        reason: `Unsupported email provider '${connection.provider}'`,
      };
    }
    return {
      ...health,
      capabilityReport: this.capabilityReport(
        connection.provider,
        String(health.status),
        typeof health.reason === 'string' ? health.reason : undefined,
      ),
    };
  }

  /**
   * Explicit capability report (WF-03 "Test connection"): never derived from
   * the OAuth handshake alone, only from a live provider probe.
   */
  private capabilityReport(
    provider: string,
    probeStatus: string,
    reason?: string,
  ) {
    const providerEvents =
      provider === 'MICROSOFT_365'
        ? ['graph.security.alerts_v2']
        : provider === 'GOOGLE_WORKSPACE'
          ? ['workspace.alertcenter.alerts']
          : [];
    // Mailbox content is outside Phase 0 for every provider (§19).
    const phase0Excluded =
      provider === 'MICROSOFT_365'
        ? ['exchange.mailbox.content', 'exchange.mailbox.write']
        : provider === 'GOOGLE_WORKSPACE'
          ? ['gmail.message.content', 'gmail.mailbox.write']
          : [];
    const healthy = probeStatus === 'HEALTHY';
    return {
      availableEventTypes: healthy ? providerEvents : [],
      unavailableEventTypes: healthy
        ? phase0Excluded
        : [...providerEvents, ...phase0Excluded],
      limitedCapability: !healthy,
      ...(healthy
        ? {}
        : {
            reason:
              reason ||
              `Provider probe returned ${probeStatus}; no events are confirmed available`,
          }),
    };
  }

  private contextFor(
    tenantId: string,
    connection: {
      id: string;
      environment_id: string;
      residency_code: string;
    },
    purpose: string,
  ) {
    return {
      connectorInstanceId: connection.id,
      tenantId,
      environmentId: connection.environment_id,
      region: connection.residency_code,
      purpose,
      correlationId: `${purpose}-${connection.id}`,
      traceId: `${purpose}-${connection.id}`,
    };
  }

  /**
   * Pull security alerts from the provider with the tenant's short-lived
   * access token (resolved and refreshed by shield-core; never stored or
   * logged here). Coverage denominators come only from the provider:
   * `expectedCount` is the provider-reported total, or null when the
   * provider gives none, in which case completeness is UNKNOWN.
   */
  async syncFromProvider(
    tenantId: string,
    connectionId: string,
    input: { accessToken: string; cursor?: string | null; maxPages?: number },
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
    if (!input.accessToken || typeof input.accessToken !== 'string') {
      throw new BadRequestException(
        'A tenant-scoped provider access token is required for collection',
      );
    }
    const cursor = input.cursor ?? null;
    if (cursor !== null && !ISO_UTC_TIMESTAMP.test(cursor)) {
      throw new BadRequestException(
        'cursor must be a UTC RFC 3339 timestamp watermark',
      );
    }
    const maxPages = Math.min(
      Math.max(Math.trunc(input.maxPages ?? DEFAULT_SYNC_PAGES), 1),
      MAX_SYNC_PAGES,
    );

    const ctx = this.contextFor(tenantId, connection, 'email-security-sync');
    const now = new Date();
    const windowStart =
      cursor ??
      new Date(Math.floor(now.getTime() / 3600000) * 3600000).toISOString();

    const normalizedRecords: NormalizedEmailThreatRecord[] = [];
    const gaps: Array<{ reason: string; detail: string }> = [];
    const seen = new Set<string>();
    let rejectedCount = 0;
    let duplicateCount = 0;
    let providerReportedCount: number | null = null;
    let status:
      | 'SYNCED'
      | 'DEGRADED'
      | 'RATE_LIMITED'
      | 'PERMISSION_REVOKED'
      | 'UNAVAILABLE' = 'SYNCED';
    let exhausted = false;
    let watermark: string | null = cursor;
    let pageRef: string | undefined;

    for (let page = 0; page < maxPages; page += 1) {
      let result: {
        alerts: unknown[];
        next?: string;
        count?: number;
        httpStatus: number;
        rateLimited?: boolean;
        retryAfterSeconds?: number;
      };
      try {
        if (connection.provider === 'MICROSOFT_365') {
          const r = await this.m365Provider.fetchAlertsPage(
            input.accessToken,
            pageRef,
            { sinceIso: cursor },
          );
          result = { ...r, next: r.nextLink };
        } else if (connection.provider === 'GOOGLE_WORKSPACE') {
          const r = await this.gwProvider.fetchAlertsPage(
            input.accessToken,
            pageRef,
            { sinceIso: cursor },
          );
          result = { ...r, next: r.nextPageToken };
        } else {
          throw new BadRequestException(
            `Unsupported email provider '${connection.provider}'`,
          );
        }
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        status = 'UNAVAILABLE';
        gaps.push({
          reason: 'PROVIDER_UNREACHABLE',
          detail: `Provider request failed: ${(err as Error).message}`,
        });
        break;
      }

      if (result.rateLimited || result.httpStatus === 429) {
        status = 'RATE_LIMITED';
        gaps.push({
          reason: 'PROVIDER_429_RATE_LIMITED',
          detail: `Provider throttled collection; retry after ${result.retryAfterSeconds ?? 60}s. Window is incomplete.`,
        });
        break;
      }
      if (result.httpStatus === 401 || result.httpStatus === 403) {
        status = 'PERMISSION_REVOKED';
        gaps.push({
          reason: 'PROVIDER_PERMISSION_DENIED',
          detail: `Provider denied access (HTTP ${result.httpStatus}); consent may be revoked or expired`,
        });
        break;
      }
      if (result.httpStatus < 200 || result.httpStatus >= 300) {
        status = 'DEGRADED';
        gaps.push({
          reason: `PROVIDER_HTTP_${result.httpStatus}`,
          detail: 'Provider returned an error page; window is incomplete',
        });
        break;
      }

      if (page === 0 && typeof result.count === 'number') {
        providerReportedCount = result.count;
      }

      for (const raw of result.alerts) {
        const sourceId = this.sourceIdOf(connection.provider, raw);
        if (sourceId && seen.has(sourceId)) {
          duplicateCount += 1;
          continue;
        }
        if (sourceId) seen.add(sourceId);

        const normalized =
          connection.provider === 'MICROSOFT_365'
            ? this.m365Normalizer.normalizeAlert(raw, ctx)
            : this.gwProvider.normalizeAlert(raw, ctx);
        if (!normalized) {
          rejectedCount += 1;
          await this.routeToDlq(tenantId, connection, raw);
          continue;
        }
        normalizedRecords.push(normalized);
        const observedMs = new Date(normalized.observedAt).getTime();
        if (Number.isFinite(observedMs)) {
          const observedIso = new Date(observedMs).toISOString();
          if (!watermark || observedIso > watermark) watermark = observedIso;
        }
      }

      if (!result.next) {
        exhausted = true;
        break;
      }
      pageRef = result.next;
    }

    if (status === 'SYNCED' && !exhausted) {
      gaps.push({
        reason: 'PAGE_LIMIT_REACHED',
        detail: `Stopped after ${maxPages} page(s); remaining alerts will be read on the next sync`,
      });
    }
    if (rejectedCount > 0) {
      gaps.push({
        reason: 'SCHEMA_VALIDATION_REJECTED',
        detail: `${rejectedCount} malformed provider record(s) routed fail-closed to DLQ`,
      });
    }

    const expectedCount = providerReportedCount;
    const accounted = normalizedRecords.length + rejectedCount;
    let completenessGrade: 'COMPLETE' | 'PARTIAL' | 'DEGRADED' | 'UNKNOWN';
    if (status !== 'SYNCED') {
      completenessGrade = 'DEGRADED';
    } else if (!exhausted) {
      completenessGrade = 'PARTIAL';
    } else if (rejectedCount > 0) {
      completenessGrade = 'DEGRADED';
    } else if (expectedCount === null) {
      // No provider total: integrity of what was read is not completeness.
      completenessGrade = 'UNKNOWN';
    } else if (accounted < expectedCount) {
      completenessGrade = 'DEGRADED';
      gaps.push({
        reason: 'PROVIDER_COUNT_MISMATCH',
        detail: `Provider reported ${expectedCount} alert(s) but ${accounted} were read`,
      });
    } else {
      completenessGrade = 'COMPLETE';
    }
    if (
      status === 'SYNCED' &&
      completenessGrade !== 'COMPLETE' &&
      completenessGrade !== 'UNKNOWN'
    ) {
      status = 'DEGRADED';
    }

    // Advance the watermark only when every page was read; otherwise keep the
    // previous cursor so nothing between pages is skipped (re-reads are
    // deduplicated downstream by source_event_ref).
    const nextCursor = status === 'SYNCED' && exhausted ? watermark : cursor;

    this.logger.log(
      `Email sync tenant=${tenantId} connection=${connection.id} status=${status} ingested=${normalizedRecords.length} rejected=${rejectedCount} duplicates=${duplicateCount} completeness=${completenessGrade}`,
    );

    return {
      status,
      normalizedRecords,
      ingestedCount: normalizedRecords.length,
      rejectedCount,
      duplicateCount,
      providerReportedCount,
      expectedCount,
      completenessGrade,
      gaps,
      nextCursor,
      windowStart,
      windowEnd: now.toISOString(),
    };
  }

  private sourceIdOf(provider: string, raw: unknown): string | null {
    if (!raw || typeof raw !== 'object') return null;
    const rec = raw as Record<string, unknown>;
    const id = provider === 'GOOGLE_WORKSPACE' ? rec.alertId : rec.id;
    return typeof id === 'string' && id.trim() ? id : null;
  }

  private async routeToDlq(
    tenantId: string,
    connection: {
      id: string;
      provider: string;
      environment_id: string;
      residency_code: string;
    },
    raw: unknown,
  ) {
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
