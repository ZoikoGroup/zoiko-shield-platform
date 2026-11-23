import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
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
import { M365EmailNormalizerService } from './m365-email.normalizer';
import type { M365SecurityAlertV2 } from './m365-email.types';

export const PHASE0_M365_ALLOWED_SCOPES = [
  'SecurityAlert.Read.All',
  'SecurityIncident.Read.All',
] as const;

export const PHASE0_M365_FORBIDDEN_SCOPES = [
  'Mail.Read',
  'Mail.ReadBasic.All',
  'Mail.ReadWrite',
  'Mail.Send',
  'MailboxSettings.ReadWrite',
] as const;

/**
 * Read-only Microsoft 365 Security Alerts v2 connector (ZS-UX-EMTI-001 §19 / ZS-EW04).
 * Connects solely to Microsoft Graph `/v1.0/security/alerts_v2` and explicitly blocks
 * Phase 0 mailbox read/write permissions (`Mail.ReadWrite`, etc.).
 */
@Injectable()
export class Microsoft365EmailProvider
  implements SecurityConnector, OnModuleInit
{
  private readonly logger = new Logger(Microsoft365EmailProvider.name);
  readonly liveConnectivityCheck = true;

  constructor(
    private readonly normalizer: M365EmailNormalizerService,
    @Optional() private readonly registry?: ConnectorRegistry,
  ) {}

  onModuleInit(): void {
    this.registry?.register('microsoft-365-email', this);
  }

  validateRequestedScopes(
    requestedScopes: string[],
    phase2Enabled = false,
  ): { allowed: boolean; rejectedScopes: string[] } {
    const forbidden = requestedScopes.filter((scope) =>
      PHASE0_M365_FORBIDDEN_SCOPES.includes(
        scope as (typeof PHASE0_M365_FORBIDDEN_SCOPES)[number],
      ),
    );
    if (!phase2Enabled && forbidden.length > 0) {
      return { allowed: false, rejectedScopes: forbidden };
    }
    return { allowed: true, rejectedScopes: [] };
  }

  async connect(
    context: ConnectorContext,
    input: ConnectInput,
  ): Promise<ConnectionResult> {
    const requestedScopes: string[] = Array.isArray(input.requestedScopes)
      ? input.requestedScopes
      : [...PHASE0_M365_ALLOWED_SCOPES];
    const scopeCheck = this.validateRequestedScopes(
      requestedScopes,
      Boolean(input.phase2ActionsApproved),
    );
    if (!scopeCheck.allowed) {
      return {
        status: 'FAILED',
        reasonCode: 'PHASE0_OVERBROAD_SCOPE_BLOCKED',
        error: `Overbroad scopes rejected in Phase 0: ${scopeCheck.rejectedScopes.join(', ')}`,
      };
    }

    if (!input.externalTenantId && !input.tenantAzureId) {
      return {
        status: 'FAILED',
        error: 'externalTenantId (Azure AD tenant GUID) is required',
      };
    }

    this.logger.log(
      `Validated read-only M365 email alert connection request for tenant=${context.tenantId}`,
    );

    return {
      status: 'CONNECTED',
      connectedAt: new Date().toISOString(),
      endpoint: 'https://graph.microsoft.com/v1.0/security/alerts_v2',
      grantedScopes: requestedScopes,
      licenceAssumptions: {
        defenderForOffice365Required: true,
        exchangeApplicationRbacSupported: Boolean(
          input.exchangeAppRbacConfigured,
        ),
      },
    };
  }

  async testConnection(
    context: ConnectorContext,
    accessToken?: string,
  ): Promise<HealthResult> {
    const started = Date.now();
    const token =
      accessToken || process.env.MS_GRAPH_TEST_ACCESS_TOKEN || undefined;
    if (!token) {
      return {
        status: 'UNVERIFIED',
        lastCheckedAt: new Date().toISOString(),
        reason:
          'No tenant OAuth access token available for live Microsoft Graph /security/alerts_v2 probe',
      };
    }

    try {
      const response = await fetch(
        'https://graph.microsoft.com/v1.0/security/alerts_v2?$top=1',
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
        const retryAfter = response.headers.get('retry-after') || '60';
        return {
          status: 'RATE_LIMITED',
          lastCheckedAt: new Date().toISOString(),
          latencyMs,
          retryAfterSeconds: Number(retryAfter) || 60,
        };
      }
      if (response.status === 401 || response.status === 403) {
        return {
          status: 'PERMISSION_REVOKED',
          lastCheckedAt: new Date().toISOString(),
          latencyMs,
          httpStatus: response.status,
          reason: `Microsoft Graph denied access (HTTP ${response.status}) for tenant=${context.tenantId}`,
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
        endpoint: '/v1.0/security/alerts_v2',
      };
    } catch (err) {
      return {
        status: 'UNAVAILABLE',
        lastCheckedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        reason: `Network reachability failure: ${(err as Error).message}`,
      };
    }
  }

  async fetchAlertsPage(
    accessToken: string,
    nextLink?: string,
  ): Promise<{
    alerts: M365SecurityAlertV2[];
    nextLink?: string;
    rateLimited?: boolean;
    retryAfterSeconds?: number;
    httpStatus: number;
  }> {
    const url =
      nextLink || 'https://graph.microsoft.com/v1.0/security/alerts_v2?$top=50';
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });
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
      value?: M365SecurityAlertV2[];
      '@odata.nextLink'?: string;
    };
    return {
      alerts: Array.isArray(payload.value) ? payload.value : [],
      nextLink: payload['@odata.nextLink'],
      httpStatus: response.status,
    };
  }

  async sync(
    context: ConnectorContext,
    alerts: M365SecurityAlertV2[] = [],
  ): Promise<SyncResult> {
    let recordsProcessed = 0;
    let rejectedCount = 0;

    for (const raw of alerts) {
      const normalized = this.normalizer.normalizeAlert(raw, context);
      if (normalized) {
        recordsProcessed += 1;
      } else {
        rejectedCount += 1;
      }
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
    const missing = PHASE0_M365_ALLOWED_SCOPES.filter(
      (req) => !grantedScopes.includes(req),
    );
    return {
      granted: grantedScopes,
      missing,
      readOnlyMode: true,
      phase2WriteEnabled: false,
    };
  }

  async disconnect(context: ConnectorContext): Promise<void> {
    this.logger.log(
      `Disconnected read-only Microsoft 365 Email Alert feed for tenant=${context.tenantId}`,
    );
  }
}
