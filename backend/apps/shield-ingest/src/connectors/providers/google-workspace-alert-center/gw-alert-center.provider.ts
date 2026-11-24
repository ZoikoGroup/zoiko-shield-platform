import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  ConnectInput,
  ConnectionResult,
  HealthResult,
  PermissionResult,
  SecurityConnector,
  SyncResult,
} from '../../core/connector.interface';
import { ConnectorContext } from '../../core/connector-context';
import { ConnectorRegistry } from '../../core/connector-registry';
import type { NormalizedEmailThreatRecord } from '../microsoft-365-email/m365-email.types';

export const PHASE0_GOOGLE_ALERT_SCOPE =
  'https://www.googleapis.com/auth/apps.alerts' as const;

export const PHASE0_GOOGLE_RESTRICTED_SCOPES = [
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
] as const;

export interface GoogleAlertCenterAlert {
  alertId: string;
  createTime?: string;
  type?: string;
  source?: string;
  severity?: string;
  metadata?: { severity?: string; status?: string };
  data?: {
    email?: string;
    domainId?: { customerDomainId?: string };
    phishingDetails?: unknown;
    messages?: Array<{ messageId?: string }>;
  };
}

/**
 * Read-only Google Workspace Alert Center connector (ZS-UX-EMTI-001 §19 / ZS-EW05).
 * Calls `GET https://alertcenter.googleapis.com/v1beta1/alerts`, validates tenant licences/scopes,
 * and refuses unrestricted Gmail mailbox read scopes in Phase 0.
 */
@Injectable()
export class GoogleWorkspaceAlertCenterProvider
  implements SecurityConnector, OnModuleInit
{
  private readonly logger = new Logger(GoogleWorkspaceAlertCenterProvider.name);
  readonly liveConnectivityCheck = true;

  constructor(@Optional() private readonly registry?: ConnectorRegistry) {}

  onModuleInit(): void {
    this.registry?.register('google-workspace-alert-center', this);
  }

  validateScopes(
    requestedScopes: string[],
    gmailRestrictedApproved = false,
  ): { allowed: boolean; rejectedScopes: string[] } {
    const restricted = requestedScopes.filter((scope) =>
      PHASE0_GOOGLE_RESTRICTED_SCOPES.includes(
        scope as (typeof PHASE0_GOOGLE_RESTRICTED_SCOPES)[number],
      ),
    );
    if (!gmailRestrictedApproved && restricted.length > 0) {
      return { allowed: false, rejectedScopes: restricted };
    }
    return { allowed: true, rejectedScopes: [] };
  }

  async connect(
    context: ConnectorContext,
    input: ConnectInput,
  ): Promise<ConnectionResult> {
    const requestedScopes: string[] = Array.isArray(input.requestedScopes)
      ? input.requestedScopes
      : [PHASE0_GOOGLE_ALERT_SCOPE];
    const check = this.validateScopes(
      requestedScopes,
      Boolean(input.gmailRestrictedScopeApproved),
    );
    if (!check.allowed) {
      return {
        status: 'FAILED',
        reasonCode: 'GOOGLE_RESTRICTED_SCOPE_BLOCKED_IN_P0',
        error: `Restricted Gmail scopes require dedicated Google verification & privacy review: ${check.rejectedScopes.join(', ')}`,
      };
    }

    this.logger.log(
      `Configured read-only Google Workspace Alert Center feed for tenant=${context.tenantId}`,
    );

    return {
      status: 'CONNECTED',
      connectedAt: new Date().toISOString(),
      endpoint: 'https://alertcenter.googleapis.com/v1beta1/alerts',
      grantedScopes: requestedScopes,
      limitedCapability: !input.workspaceEnterpriseLicence,
    };
  }

  async testConnection(
    context: ConnectorContext,
    accessToken?: string,
  ): Promise<HealthResult> {
    const started = Date.now();
    // Only the per-tenant token resolved by shield-core is accepted.
    const token = accessToken || undefined;
    if (!token) {
      return {
        status: 'UNVERIFIED',
        lastCheckedAt: new Date().toISOString(),
        reason:
          'No OAuth token available for live Google Workspace Alert Center API probe',
      };
    }

    try {
      const response = await fetch(
        'https://alertcenter.googleapis.com/v1beta1/alerts?pageSize=1',
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        },
      );
      const latencyMs = Date.now() - started;

      if (response.status === 429) {
        return {
          status: 'RATE_LIMITED',
          lastCheckedAt: new Date().toISOString(),
          latencyMs,
          retryAfterSeconds: Number(
            response.headers.get('retry-after') || '60',
          ),
        };
      }
      if (response.status === 401 || response.status === 403) {
        return {
          status: 'PERMISSION_REVOKED',
          lastCheckedAt: new Date().toISOString(),
          latencyMs,
          httpStatus: response.status,
          reason: `Google Alert Center API denied access (HTTP ${response.status}) for tenant=${context.tenantId}`,
        };
      }
      if (!response.ok) {
        return {
          status: 'DEGRADED',
          lastCheckedAt: new Date().toISOString(),
          latencyMs,
          httpStatus: response.status,
        };
      }

      return {
        status: 'HEALTHY',
        lastCheckedAt: new Date().toISOString(),
        latencyMs,
        endpoint: '/v1beta1/alerts',
      };
    } catch (err) {
      return {
        status: 'UNAVAILABLE',
        lastCheckedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        reason: `Google Alert Center unreachable: ${(err as Error).message}`,
      };
    }
  }

  /**
   * Fetch one page of Alert Center `alerts.list`. Alert Center returns no
   * total count, so callers must treat completeness as UNKNOWN. The token is
   * never logged.
   */
  async fetchAlertsPage(
    accessToken: string,
    pageToken?: string,
    options: { sinceIso?: string | null; pageSize?: number } = {},
  ): Promise<{
    alerts: GoogleAlertCenterAlert[];
    nextPageToken?: string;
    rateLimited?: boolean;
    retryAfterSeconds?: number;
    httpStatus: number;
  }> {
    const params = [
      `pageSize=${Math.min(Math.max(options.pageSize ?? 100, 1), 1000)}`,
    ];
    if (options.sinceIso) {
      params.push(
        `filter=${encodeURIComponent(`createTime > "${options.sinceIso}"`)}`,
      );
    }
    if (pageToken) {
      params.push(`pageToken=${encodeURIComponent(pageToken)}`);
    }
    const response = await fetch(
      `https://alertcenter.googleapis.com/v1beta1/alerts?${params.join('&')}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      },
    );
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after') || '60');
      return {
        alerts: [],
        rateLimited: true,
        retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : 60,
        httpStatus: 429,
      };
    }
    if (!response.ok) {
      return { alerts: [], httpStatus: response.status };
    }
    const payload = (await response.json()) as {
      alerts?: GoogleAlertCenterAlert[];
      nextPageToken?: string;
    };
    return {
      alerts: Array.isArray(payload.alerts) ? payload.alerts : [],
      nextPageToken: payload.nextPageToken || undefined,
      httpStatus: response.status,
    };
  }

  normalizeAlert(
    raw: unknown,
    context: ConnectorContext,
  ): NormalizedEmailThreatRecord | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const alert = raw as Partial<GoogleAlertCenterAlert>;
    if (typeof alert.alertId !== 'string' || !alert.alertId.trim()) {
      return null;
    }

    const sev = String(
      alert.metadata?.severity || alert.severity || 'MEDIUM',
    ).toUpperCase();
    const severity: NormalizedEmailThreatRecord['severity'] =
      sev === 'HIGH'
        ? 'HIGH'
        : sev === 'CRITICAL'
          ? 'CRITICAL'
          : sev === 'LOW'
            ? 'LOW'
            : 'MEDIUM';

    const subjectSeed = alert.data?.email || alert.alertId;
    const subjectHash = createHash('sha256')
      .update(`${context.tenantId}:${subjectSeed}`, 'utf8')
      .digest('hex')
      .slice(0, 20);

    return {
      sourceEventRef: alert.alertId,
      provider: 'GOOGLE_WORKSPACE',
      providerVerdict: alert.type || 'WORKSPACE_ALERT',
      threatClass: (alert.type || '').toLowerCase().includes('phish')
        ? 'CREDENTIAL_PHISHING'
        : 'WORKSPACE_SECURITY_ALERT',
      severity,
      observedAt: alert.createTime ? new Date(alert.createTime) : new Date(),
      subjectRef: `gw:${subjectHash}`,
      indicatorHashes: (alert.data?.messages || [])
        .filter((m) => typeof m.messageId === 'string')
        .map((m) => ({
          type: 'gmail_message_sha256',
          value: createHash('sha256')
            .update(`${context.tenantId}:${m.messageId}`, 'utf8')
            .digest('hex'),
        })),
      attachmentHashes: [],
      sourceConfidence: 'HIGH',
      policyId: alert.source || 'google-workspace-alert-center',
      policyVersion: 'v1beta1',
    };
  }

  async sync(
    context: ConnectorContext,
    alerts: GoogleAlertCenterAlert[] = [],
  ): Promise<SyncResult> {
    let recordsProcessed = 0;
    let rejectedCount = 0;
    for (const raw of alerts) {
      if (this.normalizeAlert(raw, context)) recordsProcessed += 1;
      else rejectedCount += 1;
    }
    return {
      status:
        rejectedCount > 0 && recordsProcessed === 0 ? 'DEGRADED' : 'SYNCED',
      recordsProcessed,
      rejectedCount,
      syncedAt: new Date().toISOString(),
    };
  }

  async getPermissions(
    _context: ConnectorContext,
    grantedScopes: string[] = [],
  ): Promise<PermissionResult> {
    const hasAlertScope = grantedScopes.includes(PHASE0_GOOGLE_ALERT_SCOPE);
    return {
      granted: grantedScopes,
      missing: hasAlertScope ? [] : [PHASE0_GOOGLE_ALERT_SCOPE],
      limitedCapability: !hasAlertScope,
    };
  }

  async disconnect(context: ConnectorContext): Promise<void> {
    this.logger.log(
      `Disconnected Google Workspace Alert Center feed for tenant=${context.tenantId}`,
    );
  }
}
