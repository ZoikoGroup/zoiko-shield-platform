import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CaseService } from '../case-management/services/case.service';
import { ShieldIngestClient } from '../../internal-client/shield-ingest.client';
import { ShieldAiClient } from '../../internal-client/shield-ai.client';
import { ShieldActionClient } from '../../internal-client/shield-action.client';
import { ShieldAnchorClient } from '../../internal-client/shield-anchor.client';
import type {
  ApproveEmailActionDto,
  ApproveOrActivateEmailPolicyDto,
  BuildEmailEvidenceExportDto,
  CreateEmailConnectionIntentDto,
  DecideEmailAnalysisDto,
  DisconnectEmailConnectorDto,
  DraftEmailPolicyDto,
  EvaluateEmailAiDto,
  GrantEmailAuditorAccessDto,
  LabelEmailBehaviourDto,
  PromoteEmailThreatToCaseDto,
  ProposeEmailActionDto,
  RecordEmailAdjudicationDto,
  RequestEmailBackfillDto,
  RevokeEmailAccessDto,
  RollbackEmailActionDto,
  SyncEmailConnectorDto,
  VerifyEmailConnectionIntentDto,
} from './dto/email-security.dto';

export const ALLOWED_EMAIL_PROVIDERS = [
  'MICROSOFT_365',
  'GOOGLE_WORKSPACE',
] as const;

const PHASE0_PROHIBITED_SCOPES = [
  'mail.readwrite',
  'mailboxsettings.readwrite',
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
];

const MAX_BACKFILL_DAYS = 90;
const MAX_AUDITOR_GRANT_HOURS = 168;

export interface EmailActorContext {
  userId: string;
  email: string;
  roleCodes: string[];
}

/**
 * ZoikoShield Email Threat Intelligence & Assurance Service (WF-01..WF-14).
 * Strictly supports MICROSOFT_365 (Graph /security/alerts_v2) and GOOGLE_WORKSPACE (Alert Center v1beta1).
 * Writes strictly within the `email_security` schema and delegates Case creation to `CaseService`.
 */
@Injectable()
export class EmailSecurityService {
  private readonly logger = new Logger(EmailSecurityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly caseService: CaseService,
    private readonly ingestClient: ShieldIngestClient,
    private readonly aiClient: ShieldAiClient,
    private readonly actionClient: ShieldActionClient,
    private readonly anchorClient: ShieldAnchorClient,
  ) {}

  isPhase2ActionsEnabled(): boolean {
    return process.env.ENABLE_EMAIL_PHASE2_ACTIONS === 'true';
  }

  private assertSupportedProvider(
    provider: string,
  ): asserts provider is 'MICROSOFT_365' | 'GOOGLE_WORKSPACE' {
    if (
      !ALLOWED_EMAIL_PROVIDERS.includes(
        provider as 'MICROSOFT_365' | 'GOOGLE_WORKSPACE',
      )
    ) {
      throw new BadRequestException(
        `Unsupported email provider '${provider}'. ZoikoShield supports MICROSOFT_365 and GOOGLE_WORKSPACE only.`,
      );
    }
  }

  private assertSafeScopesForPhase(
    requestedMode: string | undefined,
    scopes: string[],
  ): void {
    const phase2Enabled = this.isPhase2ActionsEnabled();
    if (requestedMode === 'PHASE2_ACTIONS' && !phase2Enabled) {
      throw new ForbiddenException(
        'EMAIL_PHASE2_GATE_LOCKED: Phase 2 write/action consent cannot be requested while ENABLE_EMAIL_PHASE2_ACTIONS is disabled (T18).',
      );
    }
    const prohibited = scopes.filter((scope) =>
      PHASE0_PROHIBITED_SCOPES.some(
        (blocked) => scope.toLowerCase().trim() === blocked,
      ),
    );
    if (prohibited.length > 0 && !phase2Enabled) {
      throw new ForbiddenException(
        `PROHIBITED_WRITE_SCOPE_BLOCKED: Refused high-privilege scope(s) [${prohibited.join(', ')}] in Phase 0/1 read-only mode (S01/S02/T18).`,
      );
    }
  }

  private async appendAudit(
    tenantId: string,
    actorId: string,
    eventType: string,
    targetId: string | null,
    detail: Record<string, unknown>,
  ) {
    await this.prisma.emailAccessAuditEvent.create({
      data: {
        tenant_id: tenantId,
        actor_id: actorId,
        event_type: eventType,
        target_id: targetId,
        detail: detail as any,
      },
    });
  }

  private isAuditorOnly(roleCodes: string[]): boolean {
    const upper = roleCodes.map((r) => r.toUpperCase());
    return (
      upper.includes('SECURITY_AUDITOR') &&
      !upper.some((r) =>
        ['TENANT_ADMIN', 'SOC_ADMIN', 'SOC_ANALYST', 'SUPER_ADMIN'].includes(r),
      )
    );
  }

  private maskFindingForRole<T extends Record<string, any>>(
    finding: T,
    roleCodes: string[],
  ): T {
    if (!this.isAuditorOnly(roleCodes)) {
      return finding;
    }
    return {
      ...finding,
      subject_ref: '[REDACTED_FOR_AUDITOR_LEAST_PRIVILEGE]',
      metadata: {
        redacted: true,
        reason: 'Role-scoped field masking (E06)',
      },
    };
  }

  private sanitizeDeepLink(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') return null;
      return parsed.toString();
    } catch {
      return null;
    }
  }

  async getOverview(
    tenantId: string,
    filters: { environmentId?: string; windowHours?: number },
  ) {
    const windowHours =
      filters.windowHours && filters.windowHours > 0
        ? Math.min(filters.windowHours, 24 * 90)
        : 24;
    const since = new Date(Date.now() - windowHours * 3600 * 1000);

    const connections = await this.prisma.emailSourceConnection.findMany({
      // tenant_id
      where: {
        tenant_id: tenantId,
        ...(filters.environmentId
          ? { environment_id: filters.environmentId }
          : {}),
      },
      orderBy: { created_at: 'desc' },
    });

    const activeConnections = connections.filter((c) => c.status === 'ACTIVE');
    const degradedConnections = connections.filter(
      (c) => c.status === 'DEGRADED',
    );
    const windows = await this.prisma.sourceCoverageWindow.findMany({
      // tenant_id
      where: {
        tenant_id: tenantId,
        window_end: { gte: since },
      },
      orderBy: { window_end: 'desc' },
      take: 100,
    });

    const openFindings = await this.prisma.emailThreatFinding.findMany({
      // tenant_id
      where: {
        tenant_id: tenantId,
        status: { in: ['OBSERVED', 'TRIAGED', 'CASE_OPENED', 'CONFIRMED'] },
        observed_at: { gte: since },
      },
      orderBy: { observed_at: 'desc' },
      take: 25,
    });

    const pendingActions = await this.prisma.emailActionProposal.count({
      where: {
        tenant_id: tenantId,
        status: { in: ['PROPOSED', 'SIMULATED', 'PENDING_APPROVAL'] },
      },
    });

    const eligibleEvents = windows.reduce(
      (sum, w) => sum + (w.expected_count || 0),
      0,
    );
    const ingestedEvents = windows.reduce(
      (sum, w) => sum + (w.ingested_count || 0),
      0,
    );
    const rejectedEvents = windows.reduce(
      (sum, w) => sum + (w.rejected_count || 0),
      0,
    );
    const missingEvents = windows.reduce(
      (sum, w) => sum + (w.missing_count || 0),
      0,
    );

    let protectionState:
      | 'NO_COVERAGE'
      | 'HEALTHY_SYNCED'
      | 'DEGRADED'
      | 'STALE'
      | 'RECOVERY_IN_PROGRESS'
      | 'UNAVAILABLE' = 'NO_COVERAGE';

    if (connections.length === 0 || activeConnections.length === 0) {
      protectionState =
        degradedConnections.length > 0 ? 'DEGRADED' : 'NO_COVERAGE';
    } else if (
      windows.some((w) => w.source_health === 'RECOVERY_IN_PROGRESS')
    ) {
      protectionState = 'RECOVERY_IN_PROGRESS';
    } else if (
      degradedConnections.length > 0 ||
      windows.some((w) => w.source_health === 'DEGRADED' || w.missing_count > 0)
    ) {
      protectionState = 'DEGRADED';
    } else if (windows.some((w) => w.source_health === 'STALE')) {
      protectionState = 'STALE';
    } else if (windows.some((w) => w.source_health === 'UNAVAILABLE')) {
      protectionState = 'UNAVAILABLE';
    } else {
      protectionState = 'HEALTHY_SYNCED';
    }

    const activePolicies = await this.prisma.emailPolicyVersion.findMany({
      // tenant_id
      where: { tenant_id: tenantId, status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });

    return {
      protectionState,
      truthBanner:
        protectionState === 'NO_COVERAGE'
          ? 'No active email source connected. Email threat visibility cannot be reported until a read-only Microsoft 365 or Google Workspace connector is verified.'
          : protectionState === 'DEGRADED'
            ? 'Email telemetry is active with partial coverage gaps or rate-limit delays; review reconciliation windows.'
            : 'Email threat visibility reflects verified read-only provider alerts within active retention windows.',
      windowHours,
      phase2ActionsLocked: !this.isPhase2ActionsEnabled(),
      connectorsSummary: {
        total: connections.length,
        active: activeConnections.length,
        degraded: degradedConnections.length,
        revoked: connections.filter((c) => c.status === 'REVOKED').length,
      },
      coverageDenominator: {
        eligibleEvents,
        ingestedEvents,
        rejectedEvents,
        missingEvents,
        completenessGrade:
          connections.length === 0
            ? 'UNKNOWN'
            : missingEvents > 0 || rejectedEvents > 0
              ? 'DEGRADED'
              : 'COMPLETE',
      },
      openFindingsCount: openFindings.length,
      criticalFindingsCount: openFindings.filter(
        (f) => f.severity.toUpperCase() === 'CRITICAL',
      ).length,
      pendingActionsCount: pendingActions,
      activePolicyVersion: activePolicies[0]
        ? `${activePolicies[0].policy_key}@v${activePolicies[0].version}`
        : null,
      providers: connections.map((c) => ({
        id: c.id,
        provider: c.provider,
        displayName: c.display_name,
        status: c.status,
        residencyCode: c.residency_code,
        lastSyncAt: c.last_sync_at?.toISOString() ?? null,
        lastHeartbeatAt: c.last_heartbeat_at?.toISOString() ?? null,
      })),
      recentThreats: openFindings.slice(0, 10).map((f) => ({
        id: f.id,
        provider: f.provider,
        threatClass: f.threat_class,
        severity: f.severity,
        status: f.status,
        providerVerdict: f.provider_verdict,
        observedAt: f.observed_at.toISOString(),
        caseId: f.case_id,
      })),
    };
  }

  async getSourceCoverage(tenantId: string) {
    const connections = await this.prisma.emailSourceConnection.findMany({
      // tenant_id
      where: { tenant_id: tenantId },
      include: {
        coverageWindows: {
          orderBy: { window_end: 'desc' },
          take: 5,
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return {
      sources: connections.map((c) => ({
        id: c.id,
        provider: c.provider,
        displayName: c.display_name,
        status: c.status,
        residencyCode: c.residency_code,
        syncFrequency: c.sync_frequency,
        retentionDays: c.retention_days,
        legalHold: c.legal_hold,
        lastSyncAt: c.last_sync_at?.toISOString() ?? null,
        latestWindow: c.coverageWindows[0]
          ? {
              id: c.coverageWindows[0].id,
              windowStart: c.coverageWindows[0].window_start.toISOString(),
              windowEnd: c.coverageWindows[0].window_end.toISOString(),
              expectedCount: c.coverageWindows[0].expected_count,
              ingestedCount: c.coverageWindows[0].ingested_count,
              rejectedCount: c.coverageWindows[0].rejected_count,
              missingCount: c.coverageWindows[0].missing_count,
              completenessGrade: c.coverageWindows[0].completeness_grade,
              sourceHealth: c.coverageWindows[0].source_health,
            }
          : null,
      })),
    };
  }

  async listConnectors(tenantId: string) {
    return this.prisma.emailSourceConnection.findMany({
      // tenant_id
      where: { tenant_id: tenantId },
      orderBy: { created_at: 'desc' },
    });
  }

  async createConnectionIntent(
    tenantId: string,
    actor: EmailActorContext,
    dto: CreateEmailConnectionIntentDto,
  ) {
    this.assertSupportedProvider(dto.provider);
    this.assertSafeScopesForPhase(dto.requestedMode, dto.requestedScopes);

    const oauthState = `zoiko-emti-${randomBytes(16).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const intent = await this.prisma.emailConnectionIntent.create({
      data: {
        tenant_id: tenantId,
        provider: dto.provider,
        requested_mode: dto.requestedMode || 'READ_ONLY_TELEMETRY',
        oauth_state: oauthState,
        pkce_challenge_hash: dto.pkceChallengeHash || null,
        requested_scopes: dto.requestedScopes,
        residency_code: dto.residencyCode || 'eu-west-1',
        status: 'CONSENT_PENDING',
        expires_at: expiresAt,
        created_by: actor.userId,
        verification_report: {
          displayName: dto.displayName,
        } as any,
      },
    });

    await this.appendAudit(
      tenantId,
      actor.userId,
      'CONNECTION_INTENT_CREATED',
      intent.id,
      {
        provider: dto.provider,
        requestedMode: intent.requested_mode,
        requestedScopes: dto.requestedScopes,
      },
    );

    return {
      intentId: intent.id,
      provider: intent.provider,
      oauthState: intent.oauth_state,
      requestedMode: intent.requested_mode,
      requestedScopes: intent.requested_scopes,
      residencyCode: intent.residency_code,
      status: intent.status,
      expiresAt: intent.expires_at.toISOString(),
    };
  }

  async verifyConnectionIntent(
    tenantId: string,
    actor: EmailActorContext,
    intentId: string,
    dto: VerifyEmailConnectionIntentDto,
  ) {
    const intent = await this.prisma.emailConnectionIntent.findFirst({
      where: { id: intentId, tenant_id: tenantId },
    });
    if (!intent) {
      throw new NotFoundException(`Connection intent '${intentId}' not found`);
    }
    this.assertSupportedProvider(intent.provider);

    if (intent.expires_at.getTime() <= Date.now()) {
      await this.prisma.emailConnectionIntent.update({
        where: { id: intent.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException(
        'CONNECTION_INTENT_EXPIRED: OAuth verification intent expired',
      );
    }

    if (intent.oauth_state !== dto.oauthState) {
      throw new ForbiddenException(
        'OAUTH_STATE_MISMATCH: Anti-CSRF OAuth state token did not match',
      );
    }

    if (!dto.consentGranted) {
      const denied = await this.prisma.emailConnectionIntent.update({
        where: { id: intent.id },
        data: {
          status: 'DENIED',
          verification_report: {
            reason: 'Admin did not grant consent',
          } as any,
        },
      });
      return { intent: denied, connection: null };
    }

    this.assertSafeScopesForPhase(intent.requested_mode, dto.grantedScopes);

    const reportMeta =
      (intent.verification_report as Record<string, unknown> | null) || {};
    const displayName =
      typeof reportMeta.displayName === 'string'
        ? reportMeta.displayName
        : `${intent.provider} Security Feed`;

    const missingAssumptions: string[] = [];
    if (
      intent.provider === 'MICROSOFT_365' &&
      dto.defenderLicenceVerified === false
    ) {
      missingAssumptions.push(
        'Microsoft Defender for Office 365 Plan P1/P2 not verified',
      );
    }
    if (
      intent.provider === 'MICROSOFT_365' &&
      dto.exchangeAppRbacVerified === false
    ) {
      missingAssumptions.push('Exchange Application RBAC scoping unverified');
    }

    const grantedScopeHash = createHash('sha256')
      .update([...dto.grantedScopes].sort().join('|'))
      .digest('hex');

    const connectionStatus =
      missingAssumptions.length > 0 ? 'DEGRADED' : 'ACTIVE';

    const connection = await this.prisma.emailSourceConnection.create({
      data: {
        tenant_id: tenantId,
        provider: intent.provider,
        display_name: displayName,
        status: connectionStatus,
        consent_ref: intent.id,
        granted_scope_hash: grantedScopeHash,
        requested_scopes: intent.requested_scopes,
        granted_scopes: dto.grantedScopes,
        residency_code: intent.residency_code,
        licence_assumptions: {
          defenderLicenceVerified: dto.defenderLicenceVerified ?? true,
          exchangeAppRbacVerified: dto.exchangeAppRbacVerified ?? true,
          missingAssumptions,
        } as any,
        capabilities: {
          readOnlyAlerts: true,
          phase2ActionsLocked: !this.isPhase2ActionsEnabled(),
        } as any,
        last_heartbeat_at: new Date(),
        created_by: actor.userId,
      },
    });

    const now = new Date();
    const hourStart = new Date(Math.floor(now.getTime() / 3600000) * 3600000);
    const hourEnd = new Date(hourStart.getTime() + 3600000);

    await this.prisma.sourceCoverageWindow.create({
      data: {
        tenant_id: tenantId,
        connection_id: connection.id,
        window_start: hourStart,
        window_end: hourEnd,
        eligible_event_types: ['email.provider.alert.v1'],
        expected_count: 0,
        ingested_count: 0,
        completeness_grade:
          connectionStatus === 'ACTIVE' ? 'COMPLETE' : 'DEGRADED',
        source_health:
          connectionStatus === 'ACTIVE' ? 'HEALTHY_SYNCED' : 'DEGRADED',
      },
    });

    const updatedIntent = await this.prisma.emailConnectionIntent.update({
      where: { id: intent.id },
      data: {
        status: 'ACTIVATED',
        granted_scope_hash: grantedScopeHash,
        connection_id: connection.id,
        verification_report: {
          ...reportMeta,
          missingAssumptions,
          verifiedAt: now.toISOString(),
        } as any,
      },
    });

    await this.appendAudit(
      tenantId,
      actor.userId,
      'CONNECTION_VERIFIED_AND_ACTIVATED',
      connection.id,
      {
        provider: connection.provider,
        status: connection.status,
        grantedScopeHash,
        missingAssumptions,
      },
    );

    return { intent: updatedIntent, connection };
  }

  async getSourceHealth(tenantId: string, connectionId: string) {
    const connection = await this.prisma.emailSourceConnection.findFirst({
      where: { id: connectionId, tenant_id: tenantId },
    });
    if (!connection) {
      throw new NotFoundException(`Email source '${connectionId}' not found`);
    }

    const windows = await this.prisma.sourceCoverageWindow.findMany({
      // tenant_id
      where: { tenant_id: tenantId, connection_id: connection.id },
      orderBy: { window_end: 'desc' },
      take: 24,
    });

    return {
      connection,
      latestWindow: windows[0] ?? null,
      windows,
    };
  }

  async testConnector(
    tenantId: string,
    actor: EmailActorContext,
    connectionId: string,
  ) {
    const connection = await this.prisma.emailSourceConnection.findFirst({
      where: { id: connectionId, tenant_id: tenantId },
    });
    if (!connection) {
      throw new NotFoundException(`Email source '${connectionId}' not found`);
    }

    const result = await this.ingestClient.testEmailSource(
      tenantId,
      connectionId,
    );
    await this.prisma.emailSourceConnection.update({
      where: { id: connection.id },
      data: { last_heartbeat_at: new Date() },
    });
    await this.appendAudit(
      tenantId,
      actor.userId,
      'CONNECTOR_TESTED',
      connection.id,
      { status: result?.data?.status ?? result?.status ?? 'CHECKED' },
    );
    return result?.data ?? result;
  }

  async syncConnector(
    tenantId: string,
    actor: EmailActorContext,
    connectionId: string,
    dto: SyncEmailConnectorDto,
  ) {
    const connection = await this.prisma.emailSourceConnection.findFirst({
      where: { id: connectionId, tenant_id: tenantId },
    });
    if (!connection) {
      throw new NotFoundException(`Email source '${connectionId}' not found`);
    }
    if (connection.status === 'REVOKED' || connection.status === 'SUSPENDED') {
      throw new ForbiddenException(
        `COLLECTION_HALTED: Email source '${connectionId}' is ${connection.status} (T16).`,
      );
    }

    const syncRes = dto.simulateRateLimit
      ? {
          status: 'DEGRADED',
          ingestedCount: 0,
          expectedCount: dto.expectedCount ?? dto.events.length,
          rejectedCount: 0,
          normalizedRecords: [],
          gaps: [
            {
              reason: 'PROVIDER_429_RATE_LIMITED',
              detail:
                'Simulated upstream throttling backoff recorded honestly.',
            },
          ],
          windowStart: new Date(
            Math.floor(Date.now() / 3600000) * 3600000,
          ).toISOString(),
          windowEnd: new Date(
            Math.floor(Date.now() / 3600000) * 3600000 + 3600000,
          ).toISOString(),
        }
      : ((
          await this.ingestClient.syncEmailSource(
            tenantId,
            connectionId,
            dto.events,
            dto.expectedCount,
          )
        )?.data ?? {
          status: 'UNAVAILABLE',
          normalizedRecords: [],
          gaps: [],
          rejectedCount: 0,
        });

    const normalized = Array.isArray(syncRes.normalizedRecords)
      ? syncRes.normalizedRecords
      : [];

    const persistedFindings = [];
    for (const rec of normalized) {
      const upserted = await this.prisma.emailThreatFinding.upsert({
        where: {
          tenant_id_connection_id_source_event_ref: {
            tenant_id: tenantId,
            connection_id: connection.id,
            source_event_ref: String(rec.sourceEventRef),
          },
        },
        update: {
          last_reconciled_at: new Date(),
          severity: String(rec.severity || 'MEDIUM'),
          provider_verdict: String(rec.providerVerdict || 'SUSPICIOUS'),
          threat_class: String(rec.threatClass || 'UNKNOWN'),
        },
        create: {
          tenant_id: tenantId,
          connection_id: connection.id,
          source_event_ref: String(rec.sourceEventRef),
          provider: connection.provider,
          provider_verdict: String(rec.providerVerdict || 'SUSPICIOUS'),
          threat_class: String(rec.threatClass || 'PHISHING'),
          severity: String(rec.severity || 'MEDIUM'),
          status: 'OBSERVED',
          observed_at: rec.observedAt ? new Date(rec.observedAt) : new Date(),
          subject_ref: String(rec.subjectRef || rec.sourceEventRef),
          indicator_hashes: (rec.indicatorHashes || []) as any,
          attachment_hashes: (rec.attachmentHashes || []) as any,
          deep_link_url: this.sanitizeDeepLink(rec.deepLinkUrl),
          source_confidence: String(rec.sourceConfidence || 'MEDIUM'),
          coverage_state:
            syncRes.status === 'DEGRADED' ? 'DEGRADED' : 'COMPLETE',
          metadata: (rec.metadata || {}) as any,
        },
      });
      persistedFindings.push(upserted);
    }

    const expectedCount =
      syncRes.expectedCount ?? dto.expectedCount ?? dto.events.length;
    const ingestedCount = persistedFindings.length;
    const rejectedCount = Number(syncRes.rejectedCount || 0);
    const missingCount = Math.max(
      0,
      expectedCount - ingestedCount - rejectedCount,
    );
    const windowHealth =
      syncRes.status === 'DEGRADED' || missingCount > 0 || rejectedCount > 0
        ? 'DEGRADED'
        : 'HEALTHY_SYNCED';

    const coverageWindow = await this.prisma.sourceCoverageWindow.create({
      data: {
        tenant_id: tenantId,
        connection_id: connection.id,
        window_start: syncRes.windowStart
          ? new Date(syncRes.windowStart)
          : new Date(Math.floor(Date.now() / 3600000) * 3600000),
        window_end: syncRes.windowEnd
          ? new Date(syncRes.windowEnd)
          : new Date(Math.floor(Date.now() / 3600000) * 3600000 + 3600000),
        eligible_event_types: ['email.provider.alert.v1'],
        expected_count: expectedCount,
        ingested_count: ingestedCount,
        rejected_count: rejectedCount,
        missing_count: missingCount,
        gaps: (syncRes.gaps || []) as any,
        completeness_grade:
          windowHealth === 'HEALTHY_SYNCED' ? 'COMPLETE' : 'DEGRADED',
        source_health: windowHealth,
      },
    });

    await this.prisma.emailSourceConnection.update({
      where: { id: connection.id },
      data: {
        last_sync_at: new Date(),
        last_heartbeat_at: new Date(),
        status: windowHealth === 'DEGRADED' ? 'DEGRADED' : 'ACTIVE',
      },
    });

    await this.appendAudit(
      tenantId,
      actor.userId,
      'CONNECTOR_SYNC_COMPLETED',
      connection.id,
      {
        ingestedCount,
        rejectedCount,
        missingCount,
        windowHealth,
      },
    );

    return {
      status: windowHealth,
      ingestedCount,
      rejectedCount,
      missingCount,
      findingsCreatedOrUpdated: persistedFindings.length,
      coverageWindow,
      gaps: syncRes.gaps || [],
    };
  }

  async disconnectConnector(
    tenantId: string,
    actor: EmailActorContext,
    connectionId: string,
    dto: DisconnectEmailConnectorDto,
  ) {
    const connection = await this.prisma.emailSourceConnection.findFirst({
      where: { id: connectionId, tenant_id: tenantId },
    });
    if (!connection) {
      throw new NotFoundException(`Email source '${connectionId}' not found`);
    }

    const updated = await this.prisma.emailSourceConnection.update({
      where: { id: connection.id },
      data: {
        status: 'REVOKED',
        revoked_at: new Date(),
        revoked_by: actor.userId,
      },
    });

    await this.appendAudit(
      tenantId,
      actor.userId,
      'ACCESS_REVOKED',
      connection.id,
      {
        provider: connection.provider,
        reason: dto.reason,
      },
    );

    return updated;
  }

  async listReconciliations(tenantId: string) {
    return this.prisma.sourceCoverageWindow.findMany({
      // tenant_id
      where: { tenant_id: tenantId },
      include: {
        connection: {
          select: {
            id: true,
            provider: true,
            display_name: true,
            status: true,
          },
        },
      },
      orderBy: { window_end: 'desc' },
      take: 50,
    });
  }

  async requestBackfill(
    tenantId: string,
    actor: EmailActorContext,
    connectionId: string,
    dto: RequestEmailBackfillDto,
  ) {
    const connection = await this.prisma.emailSourceConnection.findFirst({
      where: { id: connectionId, tenant_id: tenantId },
    });
    if (!connection) {
      throw new NotFoundException(`Email source '${connectionId}' not found`);
    }
    if (connection.status === 'REVOKED') {
      throw new ForbiddenException(
        'Cannot request backfill on a revoked email connector',
      );
    }

    const startMs = Date.parse(dto.windowStart);
    const endMs = Date.parse(dto.windowEnd);
    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      startMs >= endMs
    ) {
      throw new BadRequestException(
        'INVALID_BACKFILL_RANGE: windowStart must be strictly earlier than windowEnd',
      );
    }
    const diffDays = (endMs - startMs) / (1000 * 60 * 60 * 24);
    if (diffDays > MAX_BACKFILL_DAYS) {
      throw new BadRequestException(
        `BACKFILL_RANGE_EXCEEDED: Window exceeds maximum ${MAX_BACKFILL_DAYS} days`,
      );
    }

    const ingestResp = await this.ingestClient.requestEmailBackfill(
      tenantId,
      connectionId,
      {
        actorId: actor.userId,
        windowStart: dto.windowStart,
        windowEnd: dto.windowEnd,
        reason: dto.reason,
      },
    );

    const window = await this.prisma.sourceCoverageWindow.create({
      data: {
        tenant_id: tenantId,
        connection_id: connection.id,
        window_start: new Date(startMs),
        window_end: new Date(endMs),
        eligible_event_types: ['email.provider.alert.v1'],
        completeness_grade: 'DEGRADED',
        source_health: 'RECOVERY_IN_PROGRESS',
        gaps: [
          {
            reason: 'MANUAL_BACKFILL_REQUESTED',
            requestedBy: actor.userId,
            detail: dto.reason,
          },
        ] as any,
      },
    });

    await this.appendAudit(
      tenantId,
      actor.userId,
      'BACKFILL_REQUESTED',
      connection.id,
      {
        windowStart: dto.windowStart,
        windowEnd: dto.windowEnd,
        reason: dto.reason,
      },
    );

    return {
      backfill: ingestResp?.data ?? ingestResp,
      coverageWindow: window,
    };
  }

  async listThreats(
    tenantId: string,
    actor: EmailActorContext,
    query: {
      severity?: string;
      status?: string;
      provider?: string;
      threatClass?: string;
      search?: string;
      limit?: number;
    },
  ) {
    const limit = Math.min(Math.max(query.limit || 50, 1), 200);
    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.provider ? { provider: query.provider } : {}),
      ...(query.threatClass ? { threat_class: query.threatClass } : {}),
    };

    const items = await this.prisma.emailThreatFinding.findMany({
      // tenant_id
      where: where as any,
      orderBy: { observed_at: 'desc' },
      take: limit,
    });

    const filtered = query.search
      ? items.filter((item) => {
          const term = query.search!.toLowerCase();
          return (
            item.subject_ref.toLowerCase().includes(term) ||
            item.source_event_ref.toLowerCase().includes(term) ||
            item.threat_class.toLowerCase().includes(term)
          );
        })
      : items;

    const latestWindows = await this.prisma.sourceCoverageWindow.findMany({
      // tenant_id
      where: { tenant_id: tenantId },
      orderBy: { window_end: 'desc' },
      take: 10,
    });

    return {
      items: filtered.map((f) => this.maskFindingForRole(f, actor.roleCodes)),
      totalReturned: filtered.length,
      activeFilters: query,
      completenessDisclaimer:
        latestWindows.some((w) => w.completeness_grade !== 'COMPLETE') ||
        latestWindows.length === 0
          ? 'Coverage completeness for the selected window is incomplete or degraded; verify reconciliation gaps before drawing negative conclusions (T03).'
          : 'All configured sources report complete coverage for the latest window.',
    };
  }

  async getThreatDetail(
    tenantId: string,
    actor: EmailActorContext,
    findingId: string,
  ) {
    const finding = await this.prisma.emailThreatFinding.findFirst({
      where: { id: findingId, tenant_id: tenantId },
      include: {
        connection: true,
        adjudications: { orderBy: { created_at: 'desc' } },
        detectionDecisions: { orderBy: { created_at: 'desc' } },
        actionProposals: { orderBy: { created_at: 'desc' } },
      },
    });
    if (!finding) {
      throw new NotFoundException(
        `Email threat finding '${findingId}' not found`,
      );
    }

    await this.appendAudit(
      tenantId,
      actor.userId,
      'THREAT_DETAIL_VIEWED',
      finding.id,
      { provider: finding.provider, threatClass: finding.threat_class },
    );

    const masked = this.maskFindingForRole(finding, actor.roleCodes);
    return {
      ...masked,
      deep_link_url: this.sanitizeDeepLink(finding.deep_link_url),
      roleScopedRedacted: this.isAuditorOnly(actor.roleCodes),
      phase2ActionsLocked: !this.isPhase2ActionsEnabled(),
    };
  }

  async promoteThreatToCase(
    tenantId: string,
    actor: EmailActorContext,
    findingId: string,
    dto: PromoteEmailThreatToCaseDto,
  ) {
    const finding = await this.prisma.emailThreatFinding.findFirst({
      where: { id: findingId, tenant_id: tenantId },
      include: { connection: true },
    });
    if (!finding) {
      throw new NotFoundException(
        `Email threat finding '${findingId}' not found`,
      );
    }

    if (finding.case_id) {
      return {
        alreadyLinked: true,
        caseId: finding.case_id,
        finding,
      };
    }

    const createdCase = await this.caseService.createStandalone({
      tenantId,
      environmentId: finding.connection.environment_id || 'default-env',
      region: finding.connection.residency_code || 'eu-west-1',
      title:
        dto.title ||
        `Email Threat (${finding.provider}): ${finding.threat_class}`,
      description: `Escalated from ZoikoShield email finding ${finding.id} (provider ref ${finding.source_event_ref}, verdict ${finding.provider_verdict}).`,
      severity: dto.severity || finding.severity,
      priority: finding.severity === 'CRITICAL' ? 'P1' : 'P2',
      actorId: actor.userId,
    });

    const updatedFinding = await this.prisma.emailThreatFinding.update({
      where: { id: finding.id },
      data: {
        case_id: createdCase.id,
        status: 'CASE_OPENED',
      },
    });

    await this.appendAudit(
      tenantId,
      actor.userId,
      'THREAT_PROMOTED_TO_CASE',
      finding.id,
      { caseId: createdCase.id },
    );

    return {
      alreadyLinked: false,
      caseId: createdCase.id,
      caseRecord: createdCase,
      finding: updatedFinding,
    };
  }

  async recordAdjudication(
    tenantId: string,
    actor: EmailActorContext,
    findingId: string,
    dto: RecordEmailAdjudicationDto,
  ) {
    const finding = await this.prisma.emailThreatFinding.findFirst({
      where: { id: findingId, tenant_id: tenantId },
    });
    if (!finding) {
      throw new NotFoundException(
        `Email threat finding '${findingId}' not found`,
      );
    }

    const existing = await this.prisma.emailThreatAdjudication.findFirst({
      where: {
        tenant_id: tenantId,
        finding_id: finding.id,
        idempotency_key: dto.idempotencyKey,
      },
    });
    if (existing) {
      return { idempotentReplay: true, adjudication: existing, finding };
    }

    const adjudication = await this.prisma.emailThreatAdjudication.create({
      data: {
        tenant_id: tenantId,
        finding_id: finding.id,
        decision: dto.decision,
        rationale: dto.rationale,
        actor_id: actor.userId,
        policy_version: finding.policy_version || 'v1',
        idempotency_key: dto.idempotencyKey,
      },
    });

    const nextStatus =
      dto.decision === 'CONFIRMED'
        ? 'CONFIRMED'
        : dto.decision === 'INSUFFICIENT_EVIDENCE'
          ? 'INSUFFICIENT_EVIDENCE'
          : 'BENIGN';

    const updatedFinding = await this.prisma.emailThreatFinding.update({
      where: { id: finding.id },
      data: { status: nextStatus },
    });

    await this.appendAudit(
      tenantId,
      actor.userId,
      'THREAT_ADJUDICATED',
      finding.id,
      {
        decision: dto.decision,
        idempotencyKey: dto.idempotencyKey,
      },
    );

    return {
      idempotentReplay: false,
      adjudication,
      finding: updatedFinding,
    };
  }

  async evaluateThreatWithAi(
    tenantId: string,
    actor: EmailActorContext,
    findingId: string,
    dto: EvaluateEmailAiDto,
  ) {
    const finding = await this.prisma.emailThreatFinding.findFirst({
      where: { id: findingId, tenant_id: tenantId },
    });
    if (!finding) {
      throw new NotFoundException(
        `Email threat finding '${findingId}' not found`,
      );
    }

    const allowedSourceRefs = [
      `finding:${finding.id}`,
      finding.source_event_ref,
    ];
    const aiResp = await this.aiClient.evaluateEmailFinding(tenantId, {
      tenantId,
      findingId: finding.id,
      threatClass: finding.threat_class,
      provider: finding.provider,
      providerVerdict: finding.provider_verdict,
      subjectRef: finding.subject_ref,
      observedSignals: dto,
      allowedSourceRefs,
    });
    const evalData = aiResp?.data ?? aiResp;

    const decision = await this.prisma.emailDetectionDecision.create({
      data: {
        tenant_id: tenantId,
        finding_id: finding.id,
        detector_tier: String(evalData.detectorTier || 'DETERMINISTIC'),
        detector_version: String(evalData.detectorVersion || '1.0.0'),
        model_version: evalData.modelVersion ?? null,
        source_facts: (evalData.sourceFacts || []) as any,
        inferences: (evalData.inferences || []) as any,
        alternative_hypothesis: evalData.alternativeHypothesis ?? null,
        unknowns: (evalData.unknowns || []) as any,
        citation_refs: Array.isArray(evalData.citationRefs)
          ? evalData.citationRefs
          : [],
        abstained: Boolean(evalData.abstained),
        confidence_score: Number(evalData.confidenceScore || 0),
        native_baseline_verdict: finding.provider_verdict,
      },
    });

    await this.appendAudit(
      tenantId,
      actor.userId,
      'AI_DECISION_GENERATED',
      decision.id,
      {
        findingId: finding.id,
        abstained: decision.abstained,
        detectorTier: decision.detector_tier,
      },
    );

    return { decision, evaluation: evalData };
  }

  async getControlsCoverage(tenantId: string) {
    const connections = await this.prisma.emailSourceConnection.findMany({
      // tenant_id
      where: { tenant_id: tenantId },
    });
    const windows = await this.prisma.sourceCoverageWindow.findMany({
      // tenant_id
      where: { tenant_id: tenantId },
      orderBy: { window_end: 'desc' },
      take: 25,
    });
    const activePolicies = await this.prisma.emailPolicyVersion.findMany({
      // tenant_id
      where: { tenant_id: tenantId, status: 'ACTIVE' },
    });
    const latestManifest = await this.prisma.emailEvidenceManifest.findFirst({
      where: { tenant_id: tenantId },
      orderBy: { created_at: 'desc' },
    });

    const hasActiveSource = connections.some((c) => c.status === 'ACTIVE');
    const hasDegradedWindow = windows.some(
      (w) => w.completeness_grade !== 'COMPLETE',
    );
    const hasActivePolicy = activePolicies.length > 0;
    const hasVerifiedManifest = latestManifest?.status === 'VERIFIED';

    const deriveStatus = (met: boolean) =>
      connections.length === 0
        ? 'NO_COVERAGE'
        : met && !hasDegradedWindow
          ? 'SUPPORTED_PARTIAL_EVIDENCE'
          : 'GAP_DETECTED';

    return {
      disclaimer:
        'Control telemetry reflects verified configuration and ingestion windows only; it does not constitute formal legal or regulatory certification.',
      controls: [
        {
          controlId: 'EMAIL-GOV-01',
          framework: 'NCSC Email Security',
          title: 'Read-only provider threat telemetry verified',
          status: deriveStatus(hasActiveSource),
          missingPrerequisites: hasActiveSource
            ? []
            : [
                'Connect and verify Microsoft 365 or Google Workspace read-only source',
              ],
          latestManifestId: latestManifest?.id ?? null,
        },
        {
          controlId: 'EMAIL-GOV-02',
          framework: 'UK GDPR Art. 32 / Data Minimization',
          title:
            'Hash-based indicator storage without raw mailbox body retention',
          status: deriveStatus(hasActiveSource),
          missingPrerequisites: hasActiveSource
            ? []
            : ['No active connector inventory configured'],
          latestManifestId: latestManifest?.id ?? null,
        },
        {
          controlId: 'EMAIL-GOV-03',
          framework: 'NIS2 / DORA Telemetry Continuity',
          title:
            'Active detection policy version & bounded reconciliation coverage',
          status: deriveStatus(hasActiveSource && hasActivePolicy),
          missingPrerequisites: [
            ...(!hasActiveSource ? ['Active email source missing'] : []),
            ...(!hasActivePolicy
              ? ['Dual-approved email policy version not active']
              : []),
            ...(hasDegradedWindow
              ? [
                  'One or more reconciliation windows show missing/delayed events',
                ]
              : []),
          ],
          latestManifestId: latestManifest?.id ?? null,
        },
        {
          controlId: 'EMAIL-GOV-04',
          framework: 'SOC 2 CC7.2 / Merkle Auditability',
          title: 'Detached Merkle evidence manifest verification',
          status: hasVerifiedManifest
            ? deriveStatus(hasActiveSource)
            : 'GAP_DETECTED',
          missingPrerequisites: hasVerifiedManifest
            ? []
            : ['Generate and verify an email evidence manifest export'],
          latestManifestId: latestManifest?.id ?? null,
        },
      ],
    };
  }

  async listEvidenceManifests(tenantId: string) {
    return this.prisma.emailEvidenceManifest.findMany({
      // tenant_id
      where: { tenant_id: tenantId },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
  }

  async buildEvidenceExport(
    tenantId: string,
    actor: EmailActorContext,
    dto: BuildEmailEvidenceExportDto,
  ) {
    const startMs = Date.parse(dto.timeStart);
    const endMs = Date.parse(dto.timeEnd);
    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      startMs >= endMs
    ) {
      throw new BadRequestException(
        'timeStart must be strictly earlier than timeEnd',
      );
    }

    const startDate = new Date(startMs);
    const endDate = new Date(endMs);

    const connections = await this.prisma.emailSourceConnection.findMany({
      // tenant_id
      where: {
        tenant_id: tenantId,
        ...(dto.sourceProvider ? { provider: dto.sourceProvider } : {}),
        ...(dto.jurisdiction ? { residency_code: dto.jurisdiction } : {}),
      },
    });
    const windows = await this.prisma.sourceCoverageWindow.findMany({
      // tenant_id
      where: {
        tenant_id: tenantId,
        window_end: { gte: startDate, lte: endDate },
      },
    });
    const findings = await this.prisma.emailThreatFinding.findMany({
      // tenant_id
      where: {
        tenant_id: tenantId,
        observed_at: { gte: startDate, lte: endDate },
        ...(dto.sourceProvider ? { provider: dto.sourceProvider } : {}),
      },
      orderBy: { observed_at: 'asc' },
    });

    const canonicalEventHashes = findings.map((f) =>
      createHash('sha256')
        .update(
          JSON.stringify({
            id: f.id,
            sourceEventRef: f.source_event_ref,
            provider: f.provider,
            threatClass: f.threat_class,
            severity: f.severity,
            status: f.status,
            observedAt: f.observed_at.toISOString(),
          }),
        )
        .digest('hex'),
    );

    const sourceInventory = connections.map((c) => ({
      id: c.id,
      provider: c.provider,
      status: c.status,
      residencyCode: c.residency_code,
    }));

    const coverageGaps = windows
      .filter((w) => w.missing_count > 0 || w.rejected_count > 0)
      .map((w) => ({
        windowId: w.id,
        connectionId: w.connection_id,
        missingCount: w.missing_count,
        rejectedCount: w.rejected_count,
        gaps: w.gaps,
      }));

    const exclusions = dto.sourceProvider
      ? [
          {
            type: 'PROVIDER_FILTER',
            excludedOtherProviders: dto.sourceProvider,
          },
        ]
      : [];

    const manifestId = randomUUID();
    const anchored = (
      await this.anchorClient.anchorEmailManifest({
        manifestId,
        tenantId,
        canonicalEventHashes,
        sourceInventory,
        exclusions,
        coverageGaps,
      })
    )?.data;

    const manifest = await this.prisma.emailEvidenceManifest.create({
      data: {
        id: manifestId,
        tenant_id: tenantId,
        scope: {
          controlIds: dto.controlIds || [],
          jurisdiction: dto.jurisdiction || null,
          sourceProvider: dto.sourceProvider || null,
        } as any,
        time_start: startDate,
        time_end: endDate,
        source_inventory: sourceInventory as any,
        exclusions: exclusions as any,
        coverage_gaps: coverageGaps as any,
        canonical_event_hashes: canonicalEventHashes,
        merkle_root: anchored?.merkleRoot ?? null,
        merkle_proof_refs: (anchored?.proofsByLeafIndex || {}) as any,
        verifier_version: String(anchored?.verifierVersion || '1.0.0'),
        detached_checksum: String(
          anchored?.detachedChecksum ||
            createHash('sha256')
              .update(canonicalEventHashes.join('|'))
              .digest('hex'),
        ),
        status: 'SEALED',
        created_by: actor.userId,
      },
    });

    await this.appendAudit(
      tenantId,
      actor.userId,
      'EVIDENCE_MANIFEST_EXPORTED',
      manifest.id,
      {
        findingsCount: findings.length,
        coverageGapsCount: coverageGaps.length,
        merkleRoot: manifest.merkle_root,
      },
    );

    return {
      manifest,
      assuranceStatement:
        anchored?.assuranceStatement ||
        'Captured evidence hashes anchored; inspect coverageGaps for source completeness.',
    };
  }

  async verifyEvidenceManifest(
    tenantId: string,
    actor: EmailActorContext,
    manifestId: string,
  ) {
    const manifest = await this.prisma.emailEvidenceManifest.findFirst({
      where: { id: manifestId, tenant_id: tenantId },
    });
    if (!manifest) {
      throw new NotFoundException(
        `Evidence manifest '${manifestId}' not found`,
      );
    }

    const verifyRes = (
      await this.anchorClient.verifyEmailManifest({
        canonicalEventHashes: manifest.canonical_event_hashes,
        sourceInventory: (manifest.source_inventory as any[]) || [],
        exclusions: (manifest.exclusions as any[]) || [],
        coverageGaps: (manifest.coverage_gaps as any[]) || [],
        expectedMerkleRoot: manifest.merkle_root || '',
        expectedDetachedChecksum: manifest.detached_checksum,
      })
    )?.data;

    const verified = Boolean(verifyRes?.verified);
    const updated = await this.prisma.emailEvidenceManifest.update({
      where: { id: manifest.id },
      data: { status: verified ? 'VERIFIED' : 'VERIFICATION_FAILED' },
    });

    await this.appendAudit(
      tenantId,
      actor.userId,
      'EVIDENCE_MANIFEST_VERIFIED',
      manifest.id,
      { verified, hasKnownGaps: Boolean(verifyRes?.hasKnownGaps) },
    );

    return {
      manifest: updated,
      verification: verifyRes,
    };
  }

  async listPolicies(tenantId: string) {
    return this.prisma.emailPolicyVersion.findMany({
      // tenant_id
      where: { tenant_id: tenantId },
      orderBy: [{ policy_key: 'asc' }, { version: 'desc' }],
    });
  }

  async draftPolicy(
    tenantId: string,
    actor: EmailActorContext,
    dto: DraftEmailPolicyDto,
  ) {
    dto.providerCoverage.forEach((p) => this.assertSupportedProvider(p));

    const latest = await this.prisma.emailPolicyVersion.findFirst({
      where: { tenant_id: tenantId, policy_key: dto.policyKey },
      orderBy: { version: 'desc' },
    });

    const created = await this.prisma.emailPolicyVersion.create({
      data: {
        tenant_id: tenantId,
        policy_key: dto.policyKey,
        version: (latest?.version || 0) + 1,
        name: dto.name,
        provider_coverage: dto.providerCoverage,
        input_sources: dto.inputSources,
        severity_mapping: dto.severityMapping as any,
        rationale: dto.rationale,
        false_positive_impact: dto.falsePositiveImpact ?? null,
        status: 'DRAFT',
        authored_by: actor.userId,
      },
    });

    await this.appendAudit(
      tenantId,
      actor.userId,
      'POLICY_DRAFTED',
      created.id,
      { policyKey: created.policy_key, version: created.version },
    );

    return created;
  }

  async approvePolicy(
    tenantId: string,
    actor: EmailActorContext,
    policyId: string,
    dto: ApproveOrActivateEmailPolicyDto,
  ) {
    const policy = await this.prisma.emailPolicyVersion.findFirst({
      where: { id: policyId, tenant_id: tenantId },
    });
    if (!policy) {
      throw new NotFoundException(`Email policy '${policyId}' not found`);
    }
    if (policy.status !== 'DRAFT') {
      throw new BadRequestException(
        `Policy version is '${policy.status}'; only DRAFT policies can be approved`,
      );
    }
    if (policy.authored_by === actor.userId) {
      throw new ForbiddenException(
        'SELF_APPROVAL_BLOCKED: Policy author cannot approve their own policy draft (E10).',
      );
    }

    const updated = await this.prisma.emailPolicyVersion.update({
      where: { id: policy.id },
      data: {
        status: 'APPROVED',
        approved_by: actor.userId,
      },
    });

    await this.appendAudit(
      tenantId,
      actor.userId,
      'POLICY_APPROVED',
      policy.id,
      {
        policyKey: policy.policy_key,
        version: policy.version,
        comments: dto.comments ?? null,
      },
    );

    return updated;
  }

  async activatePolicy(
    tenantId: string,
    actor: EmailActorContext,
    policyId: string,
  ) {
    const policy = await this.prisma.emailPolicyVersion.findFirst({
      where: { id: policyId, tenant_id: tenantId },
    });
    if (!policy) {
      throw new NotFoundException(`Email policy '${policyId}' not found`);
    }
    if (policy.status !== 'APPROVED') {
      throw new ForbiddenException(
        'DUAL_APPROVAL_REQUIRED: Policy version must be APPROVED by an independent reviewer before activation (E10).',
      );
    }
    if (!policy.approved_by || policy.approved_by === policy.authored_by) {
      throw new ForbiddenException(
        'SELF_APPROVAL_BLOCKED: Policy activation requires a distinct approver (E10).',
      );
    }

    const now = new Date();
    await this.prisma.emailPolicyVersion.updateMany({
      where: {
        tenant_id: tenantId,
        policy_key: policy.policy_key,
        status: 'ACTIVE',
      },
      data: { status: 'SUPERSEDED', effective_to: now },
    });

    const activated = await this.prisma.emailPolicyVersion.update({
      where: { id: policy.id },
      data: {
        status: 'ACTIVE',
        activated_by: actor.userId,
        effective_from: now,
      },
    });

    await this.appendAudit(
      tenantId,
      actor.userId,
      'POLICY_ACTIVATED',
      policy.id,
      { policyKey: policy.policy_key, version: policy.version },
    );

    return activated;
  }

  async rollbackPolicy(
    tenantId: string,
    actor: EmailActorContext,
    policyId: string,
  ) {
    const policy = await this.prisma.emailPolicyVersion.findFirst({
      where: { id: policyId, tenant_id: tenantId },
    });
    if (!policy) {
      throw new NotFoundException(`Email policy '${policyId}' not found`);
    }

    const rolledBack = await this.prisma.emailPolicyVersion.update({
      where: { id: policy.id },
      data: { status: 'ROLLED_BACK', effective_to: new Date() },
    });

    await this.appendAudit(
      tenantId,
      actor.userId,
      'POLICY_ROLLED_BACK',
      policy.id,
      { policyKey: policy.policy_key, version: policy.version },
    );

    return rolledBack;
  }

  async getBehaviourOverview(tenantId: string) {
    const decisions = await this.prisma.emailDetectionDecision.findMany({
      // tenant_id
      where: { tenant_id: tenantId },
      include: { finding: true },
      orderBy: { created_at: 'desc' },
      take: 200,
    });

    const benchmarkResp = await this.aiClient.benchmarkEmailDetections(
      tenantId,
      decisions.map((d) => ({
        nativeBaselineVerdict: d.native_baseline_verdict,
        adjudicatedLabel: d.adjudicated_label,
        abstained: d.abstained,
        falsePositiveCostUsd: d.false_positive_cost_usd,
      })),
    );

    return {
      benchmark: benchmarkResp?.data ?? benchmarkResp,
      recentDecisions: decisions.slice(0, 25),
    };
  }

  async recordBehaviourLabel(
    tenantId: string,
    actor: EmailActorContext,
    dto: LabelEmailBehaviourDto,
  ) {
    const finding = await this.prisma.emailThreatFinding.findFirst({
      where: { id: dto.findingId, tenant_id: tenantId },
    });
    if (!finding) {
      throw new NotFoundException(`Finding '${dto.findingId}' not found`);
    }

    const latestDecision = await this.prisma.emailDetectionDecision.findFirst({
      where: { tenant_id: tenantId, finding_id: finding.id },
      orderBy: { created_at: 'desc' },
    });

    const record = latestDecision
      ? await this.prisma.emailDetectionDecision.update({
          where: { id: latestDecision.id },
          data: {
            adjudicated_label: dto.label,
            native_baseline_verdict:
              dto.nativeBaselineVerdict ?? finding.provider_verdict,
            false_positive_cost_usd: dto.falsePositiveCostUsd ?? null,
          },
        })
      : await this.prisma.emailDetectionDecision.create({
          data: {
            tenant_id: tenantId,
            finding_id: finding.id,
            detector_tier: 'DETERMINISTIC',
            detector_version: '1.0.0',
            adjudicated_label: dto.label,
            native_baseline_verdict:
              dto.nativeBaselineVerdict ?? finding.provider_verdict,
            false_positive_cost_usd: dto.falsePositiveCostUsd ?? null,
          },
        });

    await this.appendAudit(
      tenantId,
      actor.userId,
      'BEHAVIOUR_LABEL_RECORDED',
      record.id,
      { findingId: finding.id, label: dto.label },
    );

    return record;
  }

  async getAnalysisDetail(tenantId: string, analysisId: string) {
    const decision = await this.prisma.emailDetectionDecision.findFirst({
      where: { id: analysisId, tenant_id: tenantId },
      include: { finding: true },
    });
    if (!decision) {
      throw new NotFoundException(
        `Email AI analysis '${analysisId}' not found`,
      );
    }
    return {
      ...decision,
      toolExecutionAllowed: false,
      untrustedDataFirewallActive: true,
    };
  }

  async decideAnalysis(
    tenantId: string,
    actor: EmailActorContext,
    analysisId: string,
    dto: DecideEmailAnalysisDto,
  ) {
    const decision = await this.prisma.emailDetectionDecision.findFirst({
      where: { id: analysisId, tenant_id: tenantId },
    });
    if (!decision) {
      throw new NotFoundException(
        `Email AI analysis '${analysisId}' not found`,
      );
    }

    const updated = await this.prisma.emailDetectionDecision.update({
      where: { id: decision.id },
      data: {
        reviewer_id: actor.userId,
        reviewer_outcome: dto.decision,
        reviewer_rationale: dto.rationale ?? null,
        reviewed_at: new Date(),
        adjudicated_label:
          dto.decision === 'CONFIRMED'
            ? 'TRUE_POSITIVE'
            : dto.decision === 'BENIGN'
              ? 'BENIGN'
              : 'INSUFFICIENT_EVIDENCE',
      },
    });

    await this.appendAudit(
      tenantId,
      actor.userId,
      'AI_ANALYSIS_REVIEWED',
      decision.id,
      { outcome: dto.decision },
    );

    return updated;
  }

  async listActions(tenantId: string) {
    const proposals = await this.prisma.emailActionProposal.findMany({
      // tenant_id
      where: { tenant_id: tenantId },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
    return {
      phase2ActionsLocked: !this.isPhase2ActionsEnabled(),
      proposals,
    };
  }

  async proposeAction(
    tenantId: string,
    actor: EmailActorContext,
    dto: ProposeEmailActionDto,
  ) {
    this.assertSupportedProvider(dto.provider);
    if (!dto.targetRefs.length) {
      throw new BadRequestException(
        'Action proposal requires at least one verified target reference',
      );
    }

    const proposal = await this.prisma.emailActionProposal.create({
      data: {
        tenant_id: tenantId,
        finding_id: dto.findingId ?? null,
        provider: dto.provider,
        requested_action: dto.requestedAction,
        target_refs: dto.targetRefs as any,
        consent_scope: dto.consentScope,
        risk_class: dto.riskClass || 'R3',
        status: 'PROPOSED',
        initiated_by: actor.userId,
      },
    });

    await this.appendAudit(
      tenantId,
      actor.userId,
      'ACTION_PROPOSED',
      proposal.id,
      {
        provider: proposal.provider,
        requestedAction: proposal.requested_action,
        riskClass: proposal.risk_class,
      },
    );

    return {
      phase2ActionsLocked: !this.isPhase2ActionsEnabled(),
      proposal,
    };
  }

  async simulateAction(
    tenantId: string,
    actor: EmailActorContext,
    proposalId: string,
  ) {
    const proposal = await this.prisma.emailActionProposal.findFirst({
      where: { id: proposalId, tenant_id: tenantId },
    });
    if (!proposal) {
      throw new NotFoundException(`Action proposal '${proposalId}' not found`);
    }

    const simRes = (
      await this.actionClient.simulateEmailAction(tenantId, {
        proposalId: proposal.id,
        tenantId,
        provider: proposal.provider,
        requestedAction: proposal.requested_action,
        targetRefs: (proposal.target_refs as string[]) || [],
        consentScope: proposal.consent_scope,
        riskClass: proposal.risk_class,
        initiatedBy: proposal.initiated_by,
      })
    )?.data;

    const updated = await this.prisma.emailActionProposal.update({
      where: { id: proposal.id },
      data: {
        status: 'SIMULATED',
        simulation_result: (simRes || {}) as any,
        rollback_plan: (simRes?.proposedRollbackPlan || {}) as any,
      },
    });

    await this.appendAudit(
      tenantId,
      actor.userId,
      'ACTION_SIMULATED',
      proposal.id,
      { mutatedMailbox: false },
    );

    return updated;
  }

  async approveAction(
    tenantId: string,
    actor: EmailActorContext,
    proposalId: string,
    dto: ApproveEmailActionDto,
  ) {
    const proposal = await this.prisma.emailActionProposal.findFirst({
      where: { id: proposalId, tenant_id: tenantId },
    });
    if (!proposal) {
      throw new NotFoundException(`Action proposal '${proposalId}' not found`);
    }

    if (proposal.initiated_by === actor.userId) {
      throw new ForbiddenException(
        'DUAL_CUSTODY_SELF_APPROVAL_BLOCKED: Initiator cannot approve own high-risk email action (T26).',
      );
    }

    if (!proposal.simulation_result) {
      throw new BadRequestException(
        'PREFLIGHT_SIMULATION_REQUIRED: Action proposal must be simulated before approval (E13).',
      );
    }

    if (dto.decision === 'REJECT') {
      const rejected = await this.prisma.emailActionProposal.update({
        where: { id: proposal.id },
        data: { status: 'FAILED', approved_by: actor.userId },
      });
      await this.appendAudit(
        tenantId,
        actor.userId,
        'ACTION_REJECTED',
        proposal.id,
        {},
      );
      return rejected;
    }

    const ttlMinutes = Math.min(Math.max(dto.expiresInMinutes || 60, 1), 480);
    const updated = await this.prisma.emailActionProposal.update({
      where: { id: proposal.id },
      data: {
        status: 'AUTHORISED',
        approved_by: actor.userId,
        approval_expires_at: new Date(Date.now() + ttlMinutes * 60 * 1000),
      },
    });

    await this.appendAudit(
      tenantId,
      actor.userId,
      'ACTION_AUTHORISED',
      proposal.id,
      { expiresAt: updated.approval_expires_at?.toISOString() },
    );

    return updated;
  }

  async executeAction(
    tenantId: string,
    actor: EmailActorContext,
    proposalId: string,
  ) {
    if (!this.isPhase2ActionsEnabled()) {
      throw new ForbiddenException(
        'EMAIL_PHASE2_GATE_LOCKED: Post-delivery mailbox mutations are blocked in Phase 0/1 (T18).',
      );
    }

    const proposal = await this.prisma.emailActionProposal.findFirst({
      where: { id: proposalId, tenant_id: tenantId },
    });
    if (!proposal) {
      throw new NotFoundException(`Action proposal '${proposalId}' not found`);
    }

    if (!proposal.approved_by || proposal.status !== 'AUTHORISED') {
      throw new ForbiddenException(
        'DUAL_CUSTODY_APPROVAL_REQUIRED: Action must be in AUTHORISED state with an independent approver (T26).',
      );
    }

    const execRes = (
      await this.actionClient.executeEmailAction(tenantId, {
        proposalId: proposal.id,
        tenantId,
        provider: proposal.provider,
        requestedAction: proposal.requested_action,
        targetRefs: (proposal.target_refs as string[]) || [],
        consentScope: proposal.consent_scope,
        riskClass: proposal.risk_class,
        initiatedBy: proposal.initiated_by,
        approvedBy: proposal.approved_by,
        approvalExpiresAt: proposal.approval_expires_at?.toISOString() ?? null,
        hasDedicatedWriteCredential: Boolean(
          process.env.EMAIL_PHASE2_WRITE_CREDENTIAL_CONFIGURED === 'true',
        ),
      })
    )?.data;

    const updated = await this.prisma.emailActionProposal.update({
      where: { id: proposal.id },
      data: {
        status: String(execRes?.status || 'FAILED'),
        execution_result: (execRes || {}) as any,
        partial_outcomes: (execRes?.outcomes || []) as any,
      },
    });

    await this.appendAudit(
      tenantId,
      actor.userId,
      'ACTION_EXECUTED',
      proposal.id,
      { status: updated.status },
    );

    return updated;
  }

  async rollbackAction(
    tenantId: string,
    actor: EmailActorContext,
    proposalId: string,
    dto: RollbackEmailActionDto,
  ) {
    const proposal = await this.prisma.emailActionProposal.findFirst({
      where: { id: proposalId, tenant_id: tenantId },
    });
    if (!proposal) {
      throw new NotFoundException(`Action proposal '${proposalId}' not found`);
    }

    const rollbackRes = (
      await this.actionClient.rollbackEmailAction(tenantId, {
        proposalId: proposal.id,
        tenantId,
        requestedBy: actor.userId,
        targetRefs: (proposal.target_refs as string[]) || [],
      })
    )?.data;

    const updated = await this.prisma.emailActionProposal.update({
      where: { id: proposal.id },
      data: {
        status: 'COMPENSATING',
        rollback_receipt: {
          ...(rollbackRes || {}),
          reason: dto.reason ?? null,
        } as any,
      },
    });

    await this.appendAudit(
      tenantId,
      actor.userId,
      'ACTION_ROLLBACK_REQUESTED',
      proposal.id,
      { reason: dto.reason ?? null },
    );

    return updated;
  }

  async getSettingsAndGovernance(tenantId: string) {
    const [connections, recentAudit, manifests] = await Promise.all([
      this.prisma.emailSourceConnection.findMany({
        // tenant_id
        where: { tenant_id: tenantId },
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.emailAccessAuditEvent.findMany({
        // tenant_id
        where: { tenant_id: tenantId },
        orderBy: { created_at: 'desc' },
        take: 50,
      }),
      this.prisma.emailEvidenceManifest.findMany({
        // tenant_id
        where: {
          tenant_id: tenantId,
          auditor_principal_id: { not: null },
        },
        orderBy: { created_at: 'desc' },
        take: 20,
      }),
    ]);

    return {
      phase2ActionsLocked: !this.isPhase2ActionsEnabled(),
      supportedProviders: ALLOWED_EMAIL_PROVIDERS,
      connections,
      activeAuditorGrants: manifests.filter(
        (m) =>
          m.auditor_grant_expires_at &&
          m.auditor_grant_expires_at.getTime() > Date.now(),
      ),
      recentAudit,
    };
  }

  async grantAuditorAccess(
    tenantId: string,
    actor: EmailActorContext,
    dto: GrantEmailAuditorAccessDto,
  ) {
    if (
      dto.expiresInHours <= 0 ||
      dto.expiresInHours > MAX_AUDITOR_GRANT_HOURS
    ) {
      throw new BadRequestException(
        `Auditor access grants must expire within 1 to ${MAX_AUDITOR_GRANT_HOURS} hours (T09).`,
      );
    }

    const expiresAt = new Date(
      Date.now() + dto.expiresInHours * 60 * 60 * 1000,
    );

    await this.prisma.emailEvidenceManifest.updateMany({
      where: { tenant_id: tenantId },
      data: {
        auditor_principal_id: dto.auditorPrincipalId,
        auditor_grant_expires_at: expiresAt,
      },
    });

    await this.appendAudit(
      tenantId,
      actor.userId,
      'AUDITOR_ACCESS_GRANTED',
      dto.auditorPrincipalId,
      {
        auditorPrincipalId: dto.auditorPrincipalId,
        expiresAt: expiresAt.toISOString(),
      },
    );

    return {
      auditorPrincipalId: dto.auditorPrincipalId,
      expiresAt: expiresAt.toISOString(),
      scopedRole: 'SECURITY_AUDITOR',
    };
  }

  async revokeAccess(
    tenantId: string,
    actor: EmailActorContext,
    dto: RevokeEmailAccessDto,
  ) {
    return this.disconnectConnector(tenantId, actor, dto.connectionId, {
      reason: dto.reason,
    });
  }

  async getPrivacyInventory(tenantId: string) {
    const connections = await this.prisma.emailSourceConnection.findMany({
      // tenant_id
      where: { tenant_id: tenantId },
    });

    return {
      dataMinimizationMode: 'METADATA_AND_HASHED_INDICATORS_ONLY',
      rawBodyStorageEnabled: false,
      sources: connections.map((c) => ({
        connectionId: c.id,
        provider: c.provider,
        displayName: c.display_name,
        residencyCode: c.residency_code,
        retentionDays: c.retention_days,
        legalHold: c.legal_hold,
        status: c.status,
      })),
    };
  }
}
