import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  runWithPlatformScope,
  runWithTenantScope,
} from '../../../../../libs/database/src';
import { EmailCredentialVaultService } from './email-credential-vault.service';
import { EmailOAuthService, type OAuthProvider } from './email-oauth.service';
import { createHash, randomBytes, randomUUID } from 'crypto';
import {
  computeEmailAuditHash,
  EMAIL_AUDIT_GENESIS_HASH,
  verifyEmailAuditChain,
} from './email-audit-chain';
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
  CreateMailBindingDto,
  EmailOAuthCallbackDto,
  InternalMailEventDto,
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
const INTENT_TTL_MS = 15 * 60 * 1000;
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
    private readonly vault: EmailCredentialVaultService,
    private readonly oauth: EmailOAuthService,
  ) {}

  /** 409 when the analyst decided on a stale view of the record (E07). */
  private assertVersion(current: number, expected: number | undefined) {
    if (!Number.isInteger(expected) || expected !== current) {
      throw new ConflictException({
        statusCode: 409,
        code: 'STALE_VERSION',
        message:
          'This record changed after you loaded it. Reload to review the latest decision before saving.',
        currentVersion: current,
      });
    }
  }

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

  /**
   * Append one tamper-evident audit event. Events form a per-tenant hash chain
   * (seq, prev_hash, event_hash); the DB additionally rejects UPDATE/DELETE
   * (migration 20261123010000). A per-tenant advisory lock serialises writers so
   * the chain cannot fork.
   */
  private async appendAudit(
    tenantId: string,
    actorId: string,
    eventType: string,
    targetId: string | null,
    detail: Record<string, unknown>,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`email_audit:${tenantId}`}))`;
      const head = await tx.emailAccessAuditEvent.findFirst({
        where: { tenant_id: tenantId, seq: { not: null } },
        orderBy: { seq: 'desc' },
        select: { seq: true, event_hash: true },
      });
      const seq = (head?.seq ?? 0) + 1;
      const prevHash = head?.event_hash ?? EMAIL_AUDIT_GENESIS_HASH;
      const createdAt = new Date();
      const eventHash = computeEmailAuditHash({
        tenantId,
        seq,
        actorId,
        eventType,
        targetId,
        detail,
        createdAt,
        prevHash,
      });
      await tx.emailAccessAuditEvent.create({
        data: {
          tenant_id: tenantId,
          actor_id: actorId,
          event_type: eventType,
          target_id: targetId,
          detail: detail as any,
          created_at: createdAt,
          seq,
          prev_hash: prevHash,
          event_hash: eventHash,
        },
      });
    });
  }

  /** Recompute the tenant's audit chain and report any tampering or gap. */
  async verifyAuditChain(tenantId: string) {
    const rows = await this.prisma.emailAccessAuditEvent.findMany({
      where: { tenant_id: tenantId },
      orderBy: { created_at: 'asc' },
    });
    return verifyEmailAuditChain(rows as any);
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

    const activeConnections = connections.filter(
      (c) => this.effectiveStatus(c).status === 'ACTIVE',
    );
    const degradedConnections = connections.filter((c) =>
      ['DEGRADED', 'SUSPENDED'].includes(this.effectiveStatus(c).status),
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
        // Effective status: expired consent is SUSPENDED, never ACTIVE (18.1).
        status: this.effectiveStatus(c).status,
        statusReason: this.effectiveStatus(c).statusReason,
        consentExpiresAt: c.consent_expires_at?.toISOString() ?? null,
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
    const rows = await this.prisma.emailSourceConnection.findMany({
      // tenant_id
      where: { tenant_id: tenantId },
      orderBy: { created_at: 'desc' },
    });
    return rows.map((r) => this.presentConnection(r));
  }

  async createConnectionIntent(
    tenantId: string,
    actor: EmailActorContext,
    dto: CreateEmailConnectionIntentDto,
  ) {
    this.assertSupportedProvider(dto.provider);
    this.assertSafeScopesForPhase(dto.requestedMode, dto.requestedScopes);
    const provider = dto.provider as OAuthProvider;
    if (!this.oauth.isConfigured(provider)) {
      throw new BadRequestException(
        `PROVIDER_OAUTH_NOT_CONFIGURED: OAuth client for ${provider} is not configured`,
      );
    }
    // Fail before any side effect if the secret vault is unusable.
    this.vault.assertConfigured();

    // State and PKCE verifier are generated and kept server-side (WF-03, T04).
    const oauthState = EmailOAuthService.newState();
    const codeVerifier = EmailOAuthService.newCodeVerifier();
    const expiresAt = new Date(Date.now() + INTENT_TTL_MS);
    const serverScopes = EmailOAuthService.readOnlyScopes(provider);

    const intent = await this.prisma.emailConnectionIntent.create({
      data: {
        tenant_id: tenantId,
        provider,
        requested_mode: dto.requestedMode || 'READ_ONLY_TELEMETRY',
        oauth_state: oauthState,
        pkce_challenge_hash: EmailOAuthService.codeChallenge(codeVerifier),
        requested_scopes: serverScopes,
        residency_code: dto.residencyCode || 'eu-west-1',
        status: 'CONSENT_PENDING',
        expires_at: expiresAt,
        created_by: actor.userId,
        verification_report: {
          displayName: dto.displayName,
          clientRequestedScopes: dto.requestedScopes,
        } as any,
      },
    });
    const verifierRef = await this.vault.store({
      tenantId,
      provider,
      purpose: 'PKCE_VERIFIER',
      plaintext: codeVerifier,
      intentId: intent.id,
      expiresAt,
    });
    await this.prisma.emailConnectionIntent.update({
      where: { id: intent.id },
      data: { pkce_verifier_ref: verifierRef },
    });

    await this.appendAudit(
      tenantId,
      actor.userId,
      'CONNECTION_INTENT_CREATED',
      intent.id,
      {
        provider,
        requestedMode: intent.requested_mode,
        requestedScopes: serverScopes,
      },
    );

    return {
      intentId: intent.id,
      provider: intent.provider,
      status: intent.status,
      authorizationUrl: this.oauth.buildAuthorizationUrl(
        provider,
        oauthState,
        codeVerifier,
      ),
      requestedScopes: serverScopes,
      expiresAt: intent.expires_at.toISOString(),
    };
  }

  async getConnectionIntent(tenantId: string, intentId: string) {
    const intent = await this.prisma.emailConnectionIntent.findFirst({
      where: { id: intentId, tenant_id: tenantId },
    });
    if (!intent) {
      throw new NotFoundException(`Connection intent '${intentId}' not found`);
    }
    const expired =
      intent.status === 'CONSENT_PENDING' &&
      intent.expires_at.getTime() <= Date.now();
    return {
      intentId: intent.id,
      provider: intent.provider,
      status: expired ? 'EXPIRED' : intent.status,
      requestedScopes: intent.requested_scopes,
      expiresAt: intent.expires_at.toISOString(),
      connectionId: intent.connection_id ?? null,
      failureReason: intent.failure_reason ?? null,
    };
  }

  /**
   * OAuth redirect handler (WF-03 step 4). The intent is located by the
   * server-issued state AND the caller's tenant, so a state from another tenant
   * or a forged state is rejected (T04). The code is exchanged with the
   * server-held PKCE verifier; granted scopes are what the provider reports.
   * The new connection starts in VALIDATING — never ACTIVE from a handshake.
   */
  async handleOAuthCallback(
    tenantId: string,
    actor: EmailActorContext,
    dto: EmailOAuthCallbackDto,
  ) {
    const intent = await this.prisma.emailConnectionIntent.findFirst({
      where: { oauth_state: dto.state, tenant_id: tenantId },
    });
    if (!intent || intent.status !== 'CONSENT_PENDING') {
      await this.appendAudit(
        tenantId,
        actor.userId,
        'OAUTH_CALLBACK_REJECTED',
        null,
        {
          reason: intent ? `intent status ${intent.status}` : 'unknown state',
        },
      );
      throw new ForbiddenException(
        'OAUTH_STATE_MISMATCH: Anti-CSRF OAuth state token did not match an open intent for this tenant',
      );
    }
    const provider = intent.provider as OAuthProvider;

    const closeIntent = async (
      status: 'DENIED' | 'EXPIRED',
      failureReason: string,
    ) => {
      await this.vault.revoke(tenantId, { intentId: intent.id });
      await this.prisma.emailConnectionIntent.update({
        where: { id: intent.id },
        data: { status, failure_reason: failureReason },
      });
      await this.appendAudit(
        tenantId,
        actor.userId,
        `CONNECTION_INTENT_${status}`,
        intent.id,
        {
          provider,
          failureReason,
        },
      );
      return { intentId: intent.id, status, connection: null, failureReason };
    };

    if (intent.expires_at.getTime() <= Date.now()) {
      return closeIntent(
        'EXPIRED',
        'Consent was not completed before the setup intent expired',
      );
    }
    if (dto.error || !dto.code) {
      return closeIntent(
        'DENIED',
        dto.error
          ? `Provider returned '${dto.error}'`
          : 'No authorization code returned',
      );
    }

    const verifier = await this.vault.reveal(
      tenantId,
      intent.pkce_verifier_ref ?? '',
      'PKCE_VERIFIER',
    );
    const tokens = await this.oauth.exchangeCode(provider, dto.code, verifier);
    // Single-use verifier.
    await this.vault.revoke(tenantId, { intentId: intent.id });

    // Provider-reported scopes are checked against the phase allowlist.
    this.assertSafeScopesForPhase(intent.requested_mode, tokens.grantedScopes);
    if (!tokens.refreshToken) {
      return closeIntent(
        'DENIED',
        'Provider did not issue an offline (refresh) grant; continuous read-only collection is not possible',
      );
    }

    const reportMeta =
      (intent.verification_report as Record<string, unknown> | null) || {};
    const displayName =
      typeof reportMeta.displayName === 'string'
        ? reportMeta.displayName
        : `${intent.provider} Security Feed`;
    const grantedScopeHash = createHash('sha256')
      .update([...tokens.grantedScopes].sort().join('|'))
      .digest('hex');

    const connection = await this.prisma.emailSourceConnection.create({
      data: {
        tenant_id: tenantId,
        provider,
        display_name: displayName,
        status: 'VALIDATING',
        consent_ref: intent.id,
        granted_scope_hash: grantedScopeHash,
        requested_scopes: intent.requested_scopes,
        granted_scopes: tokens.grantedScopes,
        residency_code: intent.residency_code,
        consent_expires_at: new Date(Date.now() + this.consentTtlMs()),
        capabilities: {
          readOnlyAlerts: true,
          phase2ActionsLocked: !this.isPhase2ActionsEnabled(),
        } as any,
        created_by: actor.userId,
      },
    });
    const credentialRef = await this.vault.store({
      tenantId,
      provider,
      purpose: 'OAUTH_REFRESH_TOKEN',
      plaintext: tokens.refreshToken,
      connectionId: connection.id,
    });
    const validating = await this.prisma.emailSourceConnection.update({
      where: { id: connection.id },
      data: { credential_ref: credentialRef },
    });

    await this.prisma.emailConnectionIntent.update({
      where: { id: intent.id },
      data: {
        status: 'VERIFIED',
        granted_scope_hash: grantedScopeHash,
        connection_id: connection.id,
        verification_report: {
          ...reportMeta,
          verifiedAt: new Date().toISOString(),
        } as any,
      },
    });

    await this.appendAudit(
      tenantId,
      actor.userId,
      'CONNECTION_CONSENT_VERIFIED',
      connection.id,
      { provider, status: 'VALIDATING', grantedScopeHash },
    );

    return {
      intentId: intent.id,
      status: 'VERIFIED' as const,
      connection: this.presentConnection(validating),
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
      // tenant_id
      where: { tenant_id: tenantId, connection_id: connection.id },
      orderBy: { window_end: 'desc' },
      take: 24,
    });

    return {
      connection: this.presentConnection(connection),
      sourceHealth: this.effectiveSourceHealth(connection, windows[0] ?? null),
      latestWindow: windows[0] ?? null,
      windows,
    };
  }

  // ---------------------------------------------------------------------------
  // Connector lifecycle helpers (ZS-UX-EMTI-001 §18.1)
  // ---------------------------------------------------------------------------

  private consentTtlMs(): number {
    const days = Number(process.env.EMAIL_CONSENT_TTL_DAYS || 90);
    return (Number.isFinite(days) && days > 0 ? days : 90) * 86_400_000;
  }

  /** Expired consent is never presented as ACTIVE (18.1 invariant, T05). */
  private effectiveStatus(connection: {
    status: string;
    status_reason?: string | null;
    consent_expires_at?: Date | null;
  }): { status: string; statusReason: string | null } {
    const consentExpired =
      connection.consent_expires_at != null &&
      connection.consent_expires_at.getTime() <= Date.now();
    if (
      consentExpired &&
      ['ACTIVE', 'DEGRADED', 'VALIDATING'].includes(connection.status)
    ) {
      return { status: 'SUSPENDED', statusReason: 'CONSENT_EXPIRED' };
    }
    return {
      status: connection.status,
      statusReason: connection.status_reason ?? null,
    };
  }

  private presentConnection<T extends Record<string, any>>(connection: T) {
    const eff = this.effectiveStatus(connection as any);
    // Never expose secret references or binding internals beyond what the UI needs.
    const {
      credential_ref: _ref,
      last_test_report: _report,
      ...rest
    } = connection;
    return {
      ...rest,
      status: eff.status,
      status_reason: eff.statusReason,
      consent_expires_at: connection.consent_expires_at
        ? new Date(connection.consent_expires_at).toISOString()
        : null,
      has_credential: Boolean(connection.credential_ref),
    };
  }

  private effectiveSourceHealth(
    connection: {
      status: string;
      last_sync_at?: Date | null;
      consent_expires_at?: Date | null;
      status_reason?: string | null;
    },
    latestWindow: { source_health: string } | null,
  ): string {
    const eff = this.effectiveStatus(connection);
    if (['REVOKED', 'SUSPENDED'].includes(eff.status)) return 'UNAVAILABLE';
    if (['DRAFT', 'CONSENT_PENDING', 'VALIDATING'].includes(eff.status)) {
      return 'UNAVAILABLE';
    }
    const staleMs =
      Number(process.env.EMAIL_SOURCE_STALE_MINUTES || 30) * 60_000;
    if (
      !connection.last_sync_at ||
      Date.now() - connection.last_sync_at.getTime() > staleMs
    ) {
      return 'STALE';
    }
    return latestWindow?.source_health ?? 'STALE';
  }

  private async findConnectionOrThrow(tenantId: string, connectionId: string) {
    const connection = await this.prisma.emailSourceConnection.findFirst({
      where: { id: connectionId, tenant_id: tenantId },
    });
    if (!connection) {
      throw new NotFoundException(`Email source '${connectionId}' not found`);
    }
    return connection;
  }

  /** Short-lived access token from the vault-held refresh token; never persisted or logged. */
  private async resolveAccessToken(
    tenantId: string,
    connection: { id: string; provider: string; credential_ref: string | null },
  ): Promise<string> {
    if (!connection.credential_ref) {
      throw new ForbiddenException(
        'CREDENTIAL_MISSING: reconnect this provider to grant read-only access',
      );
    }
    const refreshToken = await this.vault.reveal(
      tenantId,
      connection.credential_ref,
      'OAUTH_REFRESH_TOKEN',
    );
    const tokens = await this.oauth.refreshAccessToken(
      connection.provider as OAuthProvider,
      refreshToken,
    );
    if (tokens.refreshToken && tokens.refreshToken !== refreshToken) {
      // Provider rotated the refresh token: store the new one, shred the old.
      const newRef = await this.vault.store({
        tenantId,
        provider: connection.provider,
        purpose: 'OAUTH_REFRESH_TOKEN',
        plaintext: tokens.refreshToken,
        connectionId: connection.id,
      });
      await this.vault.revoke(tenantId, {
        secretId: connection.credential_ref,
      });
      await this.prisma.emailSourceConnection.update({
        where: { id: connection.id },
        data: { credential_ref: newRef },
      });
    }
    return tokens.accessToken;
  }

  private assertCollectable(connection: {
    id: string;
    status: string;
    consent_expires_at?: Date | null;
    status_reason?: string | null;
  }) {
    const eff = this.effectiveStatus(connection);
    if (['REVOKED', 'SUSPENDED'].includes(eff.status)) {
      throw new ForbiddenException(
        `COLLECTION_HALTED: Email source '${connection.id}' is ${eff.status}${eff.statusReason ? ` (${eff.statusReason})` : ''} (T05/T16).`,
      );
    }
  }

  async testConnector(
    tenantId: string,
    actor: EmailActorContext,
    connectionId: string,
  ) {
    const connection = await this.findConnectionOrThrow(tenantId, connectionId);
    if (connection.provider === 'ZOIKO_MAIL') {
      throw new BadRequestException(
        'Zoiko Mail sources are verified by their first signed security event, not by a provider probe',
      );
    }
    this.assertCollectable(connection);
    const accessToken = await this.resolveAccessToken(tenantId, connection);
    const raw = await this.ingestClient.testEmailSource(
      tenantId,
      connectionId,
      {
        accessToken,
      },
    );
    const result = raw?.data ?? raw ?? {};
    const status = String(result.status || 'UNVERIFIED');
    const capabilityReport = {
      availableEventTypes: Array.isArray(
        result.capabilityReport?.availableEventTypes,
      )
        ? result.capabilityReport.availableEventTypes
        : [],
      unavailableEventTypes: Array.isArray(
        result.capabilityReport?.unavailableEventTypes,
      )
        ? result.capabilityReport.unavailableEventTypes
        : [],
      limitedCapability: Boolean(result.capabilityReport?.limitedCapability),
      ...(result.capabilityReport?.reason
        ? { reason: String(result.capabilityReport.reason) }
        : {}),
    };
    // A probe "passes" only when the provider actually returned data access.
    const passed =
      status === 'HEALTHY' && capabilityReport.availableEventTypes.length > 0;
    const testedAt = new Date();

    await this.prisma.emailSourceConnection.update({
      where: { id: connection.id },
      data: {
        last_heartbeat_at: testedAt,
        last_tested_at: testedAt,
        last_test_status: passed ? 'PASSED' : status,
        last_test_report: { status, passed, capabilityReport } as any,
        capabilities: {
          ...((connection.capabilities as Record<string, unknown>) || {}),
          ...capabilityReport,
        } as any,
        ...(status === 'PERMISSION_REVOKED'
          ? { status: 'DEGRADED', status_reason: 'PERMISSION_REVOKED' }
          : {}),
      },
    });
    await this.appendAudit(
      tenantId,
      actor.userId,
      'CONNECTOR_TESTED',
      connection.id,
      {
        status,
        passed,
        limitedCapability: capabilityReport.limitedCapability,
      },
    );
    return {
      passed,
      status,
      capabilityReport,
      testedAt: testedAt.toISOString(),
    };
  }

  async activateConnector(
    tenantId: string,
    actor: EmailActorContext,
    connectionId: string,
  ) {
    const connection = await this.findConnectionOrThrow(tenantId, connectionId);
    const eff = this.effectiveStatus(connection);
    if (eff.statusReason === 'CONSENT_EXPIRED') {
      throw new ConflictException(
        'CONSENT_EXPIRED: reconnect the provider to renew consent',
      );
    }
    if (['REVOKED', 'SUSPENDED'].includes(eff.status)) {
      throw new ConflictException(`CONNECTOR_${eff.status}: cannot activate`);
    }
    const testFresh =
      connection.last_test_status === 'PASSED' &&
      connection.last_tested_at != null &&
      Date.now() - connection.last_tested_at.getTime() <= 24 * 3_600_000;
    if (!testFresh) {
      throw new ConflictException(
        'ACTIVATION_REQUIRES_PASSING_TEST: run a connection test that returns provider data within the last 24 hours',
      );
    }
    const report = (connection.last_test_report as any) || {};
    const limited = Boolean(report.capabilityReport?.limitedCapability);
    const updated = await this.prisma.emailSourceConnection.update({
      where: { id: connection.id },
      data: {
        status: limited ? 'DEGRADED' : 'ACTIVE',
        status_reason: limited ? 'LIMITED_CAPABILITY' : null,
        last_heartbeat_at: new Date(),
      },
    });
    await this.appendAudit(
      tenantId,
      actor.userId,
      'CONNECTOR_ACTIVATED',
      connection.id,
      {
        status: updated.status,
        limitedCapability: limited,
      },
    );
    return this.presentConnection(updated);
  }

  async getConnectorCapabilities(tenantId: string, connectionId: string) {
    const connection = await this.findConnectionOrThrow(tenantId, connectionId);
    const caps = (connection.capabilities as Record<string, any>) || {};
    return {
      connectionId: connection.id,
      provider: connection.provider,
      availableEventTypes: Array.isArray(caps.availableEventTypes)
        ? caps.availableEventTypes
        : [],
      unavailableEventTypes: Array.isArray(caps.unavailableEventTypes)
        ? caps.unavailableEventTypes
        : [],
      limitedCapability: Boolean(caps.limitedCapability),
      licenceAssumptions: connection.licence_assumptions,
      requestedScopes: connection.requested_scopes,
      grantedScopes: connection.granted_scopes,
      lastTestedAt: connection.last_tested_at?.toISOString() ?? null,
      lastTestStatus: connection.last_test_status ?? null,
    };
  }

  async syncConnector(
    tenantId: string,
    actor: EmailActorContext,
    connectionId: string,
  ) {
    const connection = await this.findConnectionOrThrow(tenantId, connectionId);
    if (connection.provider === 'ZOIKO_MAIL') {
      throw new BadRequestException(
        'Zoiko Mail sources push signed events; there is nothing to pull',
      );
    }
    this.assertCollectable(connection);
    if (connection.status !== 'ACTIVE' && connection.status !== 'DEGRADED') {
      throw new ConflictException(
        `CONNECTOR_NOT_ACTIVE: test and activate the connector before collection (status ${connection.status})`,
      );
    }

    const accessToken = await this.resolveAccessToken(tenantId, connection);
    const syncRes = (
      await this.ingestClient.syncEmailSource(tenantId, connectionId, {
        accessToken,
        cursor: connection.sync_cursor ?? null,
        maxPages: 5,
      })
    )?.data ?? {
      status: 'UNAVAILABLE',
      normalizedRecords: [],
      gaps: [
        {
          reason: 'INGEST_UNAVAILABLE',
          detail: 'shield-ingest did not respond',
        },
      ],
      rejectedCount: 0,
      duplicateCount: 0,
      expectedCount: null,
      completenessGrade: 'UNKNOWN',
    };

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
        // Source facts are immutable once observed (18.1); only reconciliation time moves.
        update: { last_reconciled_at: new Date() },
        create: {
          tenant_id: tenantId,
          connection_id: connection.id,
          source_event_ref: String(rec.sourceEventRef),
          provider: connection.provider,
          provider_verdict: String(rec.providerVerdict || 'SUSPICIOUS'),
          threat_class: String(rec.threatClass || 'UNKNOWN'),
          severity: String(rec.severity || 'MEDIUM'),
          status: 'OBSERVED',
          observed_at: rec.observedAt ? new Date(rec.observedAt) : new Date(),
          subject_ref: String(rec.subjectRef || rec.sourceEventRef),
          indicator_hashes: (rec.indicatorHashes || []) as any,
          attachment_hashes: (rec.attachmentHashes || []) as any,
          deep_link_url: this.sanitizeDeepLink(rec.deepLinkUrl),
          source_confidence: String(rec.sourceConfidence || 'MEDIUM'),
          coverage_state:
            syncRes.completenessGrade === 'COMPLETE' ? 'COMPLETE' : 'DEGRADED',
          metadata: (rec.metadata || {}) as any,
        },
      });
      persistedFindings.push(upserted);
    }

    // The denominator comes ONLY from the provider; no total -> UNKNOWN, never COMPLETE.
    const expectedCount: number | null =
      typeof syncRes.expectedCount === 'number' ? syncRes.expectedCount : null;
    const ingestedCount = persistedFindings.length;
    const rejectedCount = Number(syncRes.rejectedCount || 0);
    const duplicateCount = Number(syncRes.duplicateCount || 0);
    const missingCount =
      expectedCount === null
        ? 0
        : Math.max(
            0,
            expectedCount - ingestedCount - rejectedCount - duplicateCount,
          );
    const completenessGrade =
      expectedCount === null
        ? 'UNKNOWN'
        : syncRes.status === 'SYNCED' &&
            missingCount === 0 &&
            rejectedCount === 0
          ? 'COMPLETE'
          : missingCount > 0 || rejectedCount > 0
            ? 'PARTIAL'
            : 'DEGRADED';
    const windowHealth =
      syncRes.status === 'PERMISSION_REVOKED' ||
      syncRes.status === 'UNAVAILABLE'
        ? 'UNAVAILABLE'
        : syncRes.status === 'SYNCED' && completenessGrade === 'COMPLETE'
          ? 'HEALTHY_SYNCED'
          : 'DEGRADED';
    const hourStart = Math.floor(Date.now() / 3600000) * 3600000;
    const windowStart = syncRes.windowStart
      ? new Date(syncRes.windowStart)
      : new Date(hourStart);
    const windowEnd = syncRes.windowEnd
      ? new Date(syncRes.windowEnd)
      : new Date(hourStart + 3600000);
    const gaps = [
      ...(syncRes.gaps || []),
      ...(expectedCount === null
        ? [
            {
              reason: 'PROVIDER_TOTAL_UNAVAILABLE',
              detail:
                'Provider did not report a total; completeness cannot be asserted',
            },
          ]
        : []),
    ];

    const coverageWindow = await this.prisma.sourceCoverageWindow.create({
      data: {
        tenant_id: tenantId,
        connection_id: connection.id,
        window_start: windowStart,
        window_end: windowEnd,
        eligible_event_types: ['email.provider.alert.v1'],
        expected_count: expectedCount ?? 0,
        ingested_count: ingestedCount,
        rejected_count: rejectedCount,
        missing_count: missingCount,
        gaps: gaps as any,
        completeness_grade: completenessGrade,
        source_health: windowHealth,
      },
    });

    await this.prisma.emailSourceConnection.update({
      where: { id: connection.id },
      data: {
        last_sync_at: new Date(),
        last_heartbeat_at: new Date(),
        ...(syncRes.nextCursor
          ? { sync_cursor: String(syncRes.nextCursor) }
          : {}),
        ...(syncRes.status === 'PERMISSION_REVOKED'
          ? { status: 'DEGRADED', status_reason: 'PERMISSION_REVOKED' }
          : windowHealth === 'HEALTHY_SYNCED'
            ? { status: 'ACTIVE', status_reason: null }
            : { status: 'DEGRADED' }),
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
        duplicateCount,
        missingCount,
        expectedCount,
        completenessGrade,
        windowHealth,
      },
    );

    return {
      status: windowHealth,
      ingestedCount,
      rejectedCount,
      duplicateCount,
      missingCount,
      expectedCount,
      completenessGrade,
      findingsCreatedOrUpdated: persistedFindings.length,
      coverageWindow,
      gaps,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
    };
  }

  /** Revoke: stop collection, crypto-shred credentials, record who/why (WF-14, T16). */
  async disconnectConnector(
    tenantId: string,
    actor: EmailActorContext,
    connectionId: string,
    dto: DisconnectEmailConnectorDto,
  ) {
    const connection = await this.findConnectionOrThrow(tenantId, connectionId);

    const shredded = await this.vault.revoke(tenantId, {
      connectionId: connection.id,
    });
    const updated = await this.prisma.emailSourceConnection.update({
      where: { id: connection.id },
      data: {
        status: 'REVOKED',
        status_reason: 'PERMISSION_REVOKED',
        credential_ref: null,
        sync_cursor: null,
        mail_binding_id: null,
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
        credentialsShredded: shredded,
      },
    );

    return this.presentConnection(updated);
  }

  // ---------------------------------------------------------------------------
  // Providers and Zoiko Mail binding (WF-02/03, ZS-UX-EMTI-001 EW06)
  // ---------------------------------------------------------------------------

  private zoikoMailEnabled(): boolean {
    return process.env.EMAIL_ZOIKO_MAIL_INTEGRATION_ENABLED === 'true';
  }

  listProviders() {
    const oauth = (provider: OAuthProvider, displayName: string) => {
      const enabled = this.oauth.isConfigured(provider);
      return {
        provider,
        displayName,
        enabled,
        connectMethod: 'OAUTH' as const,
        ...(enabled
          ? {}
          : {
              reasonDisabled:
                'The OAuth client for this provider is not configured on this deployment.',
            }),
      };
    };
    return [
      oauth('MICROSOFT_365', 'Microsoft 365'),
      oauth('GOOGLE_WORKSPACE', 'Google Workspace'),
      {
        provider: 'ZOIKO_MAIL' as const,
        displayName: 'Zoiko Mail',
        enabled: this.zoikoMailEnabled(),
        connectMethod: 'MAIL_BINDING' as const,
        ...(this.zoikoMailEnabled()
          ? {}
          : {
              reasonDisabled:
                'Zoiko Mail security events are not enabled: the cross-product event boundary (ADR-ZSSEC-01, decision D05) is pending approval.',
            }),
      },
    ];
  }

  async createMailBinding(
    tenantId: string,
    actor: EmailActorContext,
    dto: CreateMailBindingDto,
  ) {
    if (!this.zoikoMailEnabled()) {
      throw new ForbiddenException(
        'ZOIKO_MAIL_INTEGRATION_DISABLED: pending ADR-ZSSEC-01 / decision D05',
      );
    }
    // Opaque, server-issued mapping; Mail never chooses the Shield tenant (07.1 tenant_binding_id).
    const bindingId = `zmb_${randomBytes(24).toString('base64url')}`;
    const connection = await this.prisma.emailSourceConnection.create({
      data: {
        tenant_id: tenantId,
        provider: 'ZOIKO_MAIL',
        display_name: dto.displayName,
        status: 'VALIDATING',
        status_reason: 'AWAITING_FIRST_EVENT',
        mail_binding_id: bindingId,
        requested_scopes: [],
        granted_scopes: [],
        sync_frequency: 'PUSH',
        capabilities: {
          readOnlyAlerts: true,
          availableEventTypes: [
            'mail.security.inbound_verdict.v1',
            'mail.security.outbound_hold.v1',
            'mail.security.quarantine_changed.v1',
            'mail.security.account_risk.v1',
            'mail.security.coverage_report.v1',
          ],
        } as any,
        created_by: actor.userId,
      },
    });
    await this.appendAudit(
      tenantId,
      actor.userId,
      'MAIL_BINDING_CREATED',
      connection.id,
      {
        provider: 'ZOIKO_MAIL',
      },
    );
    return {
      bindingId,
      connectionId: connection.id,
      status: 'VALIDATING',
      status_reason: 'AWAITING_FIRST_EVENT',
    };
  }

  /**
   * Internal: a Zoiko Mail SecurityEventEnvelope that shield-ingest has already
   * signature-, registry-, freshness- and replay-checked. The tenant comes only
   * from the server-side binding, never from the event (07.1).
   */
  async ingestMailEvent(dto: InternalMailEventDto) {
    if (!this.zoikoMailEnabled()) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'ZOIKO_MAIL_INTEGRATION_DISABLED',
        message:
          'Zoiko Mail security events are not enabled on this deployment',
      });
    }
    // Binding lookup is the only cross-tenant read: by unique opaque id, in an
    // explicitly declared and logged platform scope. Everything after it runs in
    // the resolved tenant's scope, so RLS applies to every write.
    const connection = await runWithPlatformScope(
      'zoiko mail tenant binding resolution',
      () =>
        this.prisma.emailSourceConnection.findFirst({
          where: {
            mail_binding_id: dto.tenantBindingId,
            provider: 'ZOIKO_MAIL',
          },
        }),
    );
    if (!connection || connection.status === 'REVOKED') {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'UNKNOWN_TENANT_BINDING',
        message: 'The tenant binding is unknown or revoked',
      });
    }
    return runWithTenantScope(connection.tenant_id, () =>
      this.persistMailEvent(connection, dto),
    );
  }

  private async persistMailEvent(
    connection: { id: string; tenant_id: string },
    dto: InternalMailEventDto,
  ) {
    const tenantId = connection.tenant_id;
    const now = new Date();

    if (dto.eventType === 'mail.security.coverage_report.v1' && dto.coverage) {
      const expected = Math.max(0, Number(dto.coverage.expectedCount) || 0);
      const observed = Math.max(0, Number(dto.coverage.observedCount) || 0);
      const missing = Math.max(0, expected - observed);
      await this.prisma.sourceCoverageWindow.create({
        data: {
          tenant_id: tenantId,
          connection_id: connection.id,
          window_start: new Date(dto.coverage.windowStart),
          window_end: new Date(dto.coverage.windowEnd),
          eligible_event_types: ['mail.security.*'],
          expected_count: expected,
          ingested_count: observed,
          missing_count: missing,
          gaps: (dto.coverage.gaps || []) as any,
          completeness_grade:
            dto.coverageState === 'COMPLETE' && missing === 0
              ? 'COMPLETE'
              : 'DEGRADED',
          source_health:
            dto.coverageState === 'COMPLETE' && missing === 0
              ? 'HEALTHY_SYNCED'
              : 'DEGRADED',
        },
      });
      await this.markMailBindingLive(connection.id, now);
      return { accepted: true, duplicate: false };
    }

    const existing = await this.prisma.emailThreatFinding.findFirst({
      where: {
        tenant_id: tenantId,
        connection_id: connection.id,
        source_event_ref: dto.sourceEventId,
      },
      select: { id: true },
    });
    if (existing) {
      await this.markMailBindingLive(connection.id, now);
      return { accepted: true, duplicate: true, findingId: existing.id };
    }
    const finding = await this.prisma.emailThreatFinding.create({
      data: {
        tenant_id: tenantId,
        connection_id: connection.id,
        source_event_ref: dto.sourceEventId,
        provider: 'ZOIKO_MAIL',
        provider_verdict: dto.sourceVerdict || 'UNKNOWN',
        threat_class: dto.threatClass || dto.eventType,
        severity: dto.sourceVerdict === 'MALICIOUS' ? 'HIGH' : 'MEDIUM',
        status: 'OBSERVED',
        policy_id: dto.policyId ?? null,
        policy_version: dto.policyVersion || 'unknown',
        observed_at: new Date(dto.observedAt),
        subject_ref: dto.subjectRef,
        source_confidence: 'PROVIDER_ASSERTED',
        coverage_state: dto.coverageState,
        metadata: {
          eventId: dto.eventId,
          eventType: dto.eventType,
          producer: dto.producer,
          actionState: dto.actionState ?? null,
          dataClass: dto.dataClass,
          residencyCode: dto.residencyCode ?? null,
          evidenceRef: dto.evidenceRef ?? null,
          payloadHash: dto.payloadHash,
          occurredAt: dto.occurredAt,
        } as any,
      },
    });
    await this.markMailBindingLive(connection.id, now);
    await this.appendAudit(
      tenantId,
      'system:zoiko-mail',
      'MAIL_EVENT_INGESTED',
      finding.id,
      {
        eventType: dto.eventType,
        eventId: dto.eventId,
      },
    );
    return { accepted: true, duplicate: false, findingId: finding.id };
  }

  private async markMailBindingLive(connectionId: string, at: Date) {
    await this.prisma.emailSourceConnection.update({
      where: { id: connectionId },
      data: {
        last_sync_at: at,
        last_heartbeat_at: at,
        status: 'ACTIVE',
        status_reason: null,
      },
    });
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
    const term = query.search?.trim().slice(0, 200);
    // Tenant filter and search are applied in the query, before pagination (WF-05).
    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.provider ? { provider: query.provider } : {}),
      ...(query.threatClass ? { threat_class: query.threatClass } : {}),
      ...(term
        ? {
            OR: [
              { subject_ref: { contains: term, mode: 'insensitive' } },
              { source_event_ref: { contains: term, mode: 'insensitive' } },
              { threat_class: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const items = await this.prisma.emailThreatFinding.findMany({
      // tenant_id
      where: where as any,
      orderBy: { observed_at: 'desc' },
      take: limit,
    });

    const filtered = items;

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

  /** WF-06 provenance rail and timeline: what was observed, by which source/policy, and what was not. */
  async getThreatProvenance(
    tenantId: string,
    actor: EmailActorContext,
    findingId: string,
  ) {
    const finding = await this.prisma.emailThreatFinding.findFirst({
      where: { id: findingId, tenant_id: tenantId },
      include: {
        connection: true,
        adjudications: { orderBy: { created_at: 'asc' } },
        detectionDecisions: { orderBy: { created_at: 'asc' } },
      },
    });
    if (!finding) {
      throw new NotFoundException(
        `Email threat finding '${findingId}' not found`,
      );
    }
    const dayMs = 86_400_000;
    const [windows, manifests, caseAudit] = await Promise.all([
      this.prisma.sourceCoverageWindow.findMany({
        // tenant_id
        where: {
          tenant_id: tenantId,
          connection_id: finding.connection_id,
          window_end: { gte: new Date(finding.observed_at.getTime() - dayMs) },
          window_start: {
            lte: new Date(finding.observed_at.getTime() + dayMs),
          },
        },
        orderBy: { window_start: 'asc' },
        take: 100,
      }),
      this.prisma.emailEvidenceManifest.findMany({
        // tenant_id
        where: {
          tenant_id: tenantId,
          time_start: { lte: finding.observed_at },
          time_end: { gte: finding.observed_at },
        },
        orderBy: { created_at: 'asc' },
        take: 20,
      }),
      finding.case_id
        ? this.prisma.emailAccessAuditEvent.findFirst({
            where: {
              tenant_id: tenantId,
              target_id: finding.id,
              event_type: 'THREAT_PROMOTED_TO_CASE',
            },
            orderBy: { created_at: 'asc' },
          })
        : Promise.resolve(null),
    ]);
    const latestWindow = windows[windows.length - 1] ?? null;

    const timeline = [
      {
        stage: 'SOURCE_OBSERVED',
        at: finding.observed_at.toISOString(),
        ref: finding.source_event_ref,
      },
      {
        stage: 'INGESTED',
        at: finding.ingested_at.toISOString(),
        ref: finding.id,
      },
      ...(finding.case_id
        ? [
            {
              stage: 'CASE_OPENED',
              at: (caseAudit?.created_at ?? finding.updated_at).toISOString(),
              ref: finding.case_id,
            },
          ]
        : []),
      ...finding.adjudications.map((a) => ({
        stage: 'ANALYST_DECISION',
        at: a.created_at.toISOString(),
        ref: a.id,
      })),
      ...manifests.map((m) => ({
        stage: 'EVIDENCE_COMMITTED',
        at: m.created_at.toISOString(),
        ref: m.id,
      })),
    ].sort((x, y) => x.at.localeCompare(y.at));

    await this.appendAudit(
      tenantId,
      actor.userId,
      'THREAT_PROVENANCE_VIEWED',
      finding.id,
      {},
    );

    return {
      findingId: finding.id,
      version: finding.version,
      sourceEventRef: finding.source_event_ref,
      provider: finding.provider,
      providerVerdict: finding.provider_verdict,
      policyId: finding.policy_id,
      policyVersion: finding.policy_version,
      detectorDecisions: finding.detectionDecisions.map((d) => ({
        detectorTier: d.detector_tier,
        detectorVersion: d.detector_version,
        modelVersion: d.model_version,
        abstained: d.abstained,
        createdAt: d.created_at.toISOString(),
      })),
      observedAt: finding.observed_at.toISOString(),
      ingestedAt: finding.ingested_at.toISOString(),
      lastReconciledAt: finding.last_reconciled_at?.toISOString() ?? null,
      sourcePermissionTier:
        finding.provider === 'ZOIKO_MAIL'
          ? 'SIGNED_EVENT_BINDING'
          : 'READ_ONLY_ALERT_TELEMETRY',
      licenceAssumptions: finding.connection.licence_assumptions,
      dataFreshness: {
        lastSyncAt: finding.connection.last_sync_at?.toISOString() ?? null,
        sourceHealth: this.effectiveSourceHealth(
          finding.connection,
          latestWindow,
        ),
      },
      coverageExceptions: windows
        .filter(
          (w) => w.completeness_grade !== 'COMPLETE' || w.missing_count > 0,
        )
        .map((w) => ({
          windowStart: w.window_start.toISOString(),
          windowEnd: w.window_end.toISOString(),
          completenessGrade: w.completeness_grade,
          missingCount: w.missing_count,
        })),
      timeline,
      roleScopedRedacted: this.isAuditorOnly(actor.roleCodes),
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
    this.assertVersion(finding.version, dto.expectedVersion);

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

    // Compare-and-set on version so two analysts cannot silently overwrite each other.
    const cas = await this.prisma.emailThreatFinding.updateMany({
      where: { id: finding.id, tenant_id: tenantId, version: finding.version },
      data: { status: nextStatus, version: { increment: 1 } },
    });
    if (cas.count !== 1) {
      const fresh = await this.prisma.emailThreatFinding.findFirst({
        where: { id: finding.id, tenant_id: tenantId },
        select: { version: true },
      });
      this.assertVersion(
        fresh?.version ?? finding.version + 1,
        dto.expectedVersion,
      );
    }
    const updatedFinding = await this.prisma.emailThreatFinding.findFirst({
      where: { id: finding.id, tenant_id: tenantId },
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
    // Message text is adversary-controlled and privacy-sensitive (SEC-12): it is
    // forwarded only for this one evaluation, never stored, and its use is audited
    // by hash and length only.
    const snippet =
      typeof (dto as any).untrustedSnippet === 'string'
        ? ((dto as any).untrustedSnippet as string)
        : '';
    if (snippet) {
      await this.appendAudit(
        tenantId,
        actor.userId,
        'UNTRUSTED_CONTENT_SUBMITTED_FOR_AI',
        finding.id,
        {
          sha256: createHash('sha256').update(snippet).digest('hex'),
          length: snippet.length,
        },
      );
    }
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

    const hasActiveSource = connections.some(
      (c) => this.effectiveStatus(c).status === 'ACTIVE',
    );
    const hasDegradedWindow = windows.some(
      (w) => w.completeness_grade !== 'COMPLETE',
    );
    const hasActivePolicy = activePolicies.length > 0;
    const hasVerifiedManifest = latestManifest?.status === 'VERIFIED';

    // E08: every coverage fraction exposes numerator, denominator and exclusions.
    const eligible = connections.filter((c) => c.status !== 'REVOKED');
    const monitored = eligible.filter((c) =>
      ['ACTIVE'].includes(this.effectiveStatus(c).status),
    );
    const excluded = eligible
      .filter((c) => !monitored.includes(c))
      .map((c) => {
        const eff = this.effectiveStatus(c);
        return {
          connectionId: c.id,
          provider: c.provider,
          reason: eff.statusReason ?? eff.status,
        };
      });
    const fraction = {
      numerator: monitored.length,
      denominator: eligible.length,
      excluded,
    };
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
          ...fraction,
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
          ...fraction,
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
          ...fraction,
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
          ...fraction,
        },
      ],
    };
  }

  /** WF-08 "View evidence": control -> windows -> manifests -> findings for a period, with the fraction behind it. */
  async getControlEvidence(
    tenantId: string,
    controlId: string,
    range: { windowStart?: string; windowEnd?: string },
  ) {
    const coverage = await this.getControlsCoverage(tenantId);
    const control = coverage.controls.find((c) => c.controlId === controlId);
    if (!control) {
      throw new NotFoundException(`Email control '${controlId}' not found`);
    }
    const end = range.windowEnd ? new Date(range.windowEnd) : new Date();
    const start = range.windowStart
      ? new Date(range.windowStart)
      : new Date(end.getTime() - 30 * 86_400_000);
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      start >= end
    ) {
      throw new BadRequestException(
        'INVALID_RANGE: windowStart must be earlier than windowEnd',
      );
    }
    const [manifests, findings] = await Promise.all([
      this.prisma.emailEvidenceManifest.findMany({
        // tenant_id
        where: {
          tenant_id: tenantId,
          time_end: { gte: start },
          time_start: { lte: end },
        },
        orderBy: { created_at: 'desc' },
        take: 50,
      }),
      this.prisma.emailThreatFinding.findMany({
        // tenant_id
        where: { tenant_id: tenantId, observed_at: { gte: start, lte: end } },
        orderBy: { observed_at: 'desc' },
        take: 200,
        select: { id: true, observed_at: true, policy_version: true },
      }),
    ]);
    return {
      controlId,
      status: control.status,
      windowStart: start.toISOString(),
      windowEnd: end.toISOString(),
      numerator: control.numerator,
      denominator: control.denominator,
      excluded: control.excluded,
      manifests: manifests.map((m) => ({
        id: m.id,
        merkleRoot: m.merkle_root,
        status: m.status,
        createdAt: m.created_at.toISOString(),
        coverageGaps: m.coverage_gaps,
      })),
      findings: findings.map((f) => ({
        id: f.id,
        observedAt: f.observed_at.toISOString(),
        policyVersion: f.policy_version,
      })),
      limitations:
        'Cryptographic integrity of captured records is not proof of completeness or detection accuracy; excluded and missing sources are listed separately.',
    };
  }

  async listEvidenceManifests(tenantId: string, actor?: EmailActorContext) {
    // External auditors see only manifests expressly shared with them, while the grant is live (T09).
    const auditorOnly = actor ? this.isAuditorOnly(actor.roleCodes) : false;
    return this.prisma.emailEvidenceManifest.findMany({
      // tenant_id
      where: {
        tenant_id: tenantId,
        ...(auditorOnly
          ? {
              auditor_principal_id: actor!.userId,
              auditor_grant_revoked_at: null,
              auditor_grant_expires_at: { gt: new Date() },
            }
          : {}),
      },
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

    this.assertVersion(decision.version, dto.expectedVersion);
    const cas = await this.prisma.emailDetectionDecision.updateMany({
      where: {
        id: decision.id,
        tenant_id: tenantId,
        version: decision.version,
      },
      data: {
        version: { increment: 1 },
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
    if (cas.count !== 1) {
      this.assertVersion(decision.version + 1, dto.expectedVersion);
    }
    const updated = await this.prisma.emailDetectionDecision.findFirst({
      where: { id: decision.id, tenant_id: tenantId },
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
        actorTenantId: tenantId,
        actorType: 'HUMAN_USER',
        actorRoles: actor.roleCodes,
        purpose: 'email_action_simulation',
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
    options?: { dryRun?: boolean; idempotencyKey?: string },
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
        // Per-tenant, per-provider vault entry, not a deployment-wide flag (SEC-04).
        hasDedicatedWriteCredential:
          process.env.EMAIL_PHASE2_WRITE_CREDENTIAL_CONFIGURED === 'true' &&
          (await this.vault.hasActive(
            tenantId,
            'PHASE2_WRITE',
            proposal.provider,
          )),
        dryRun: options?.dryRun ?? false,
        idempotencyKey: options?.idempotencyKey,
        actorTenantId: tenantId,
        actorType: 'HUMAN_USER',
        actorRoles: actor.roleCodes,
        purpose: 'email_threat_remediation',
      })
    )?.data;

    const nextStatus =
      execRes?.status === 'DRY_RUN'
        ? proposal.status
        : String(execRes?.status || 'FAILED');

    const updated = await this.prisma.emailActionProposal.update({
      where: { id: proposal.id },
      data: {
        status: nextStatus,
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
        riskClass: proposal.risk_class,
        actorTenantId: tenantId,
        actorType: 'HUMAN_USER',
        actorRoles: actor.roleCodes,
        purpose: 'email_action_compensation',
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
      connections: connections.map((c) => this.presentConnection(c)),
      activeAuditorGrants: manifests.filter(
        (m) =>
          !m.auditor_grant_revoked_at &&
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

    const manifestIds = [...new Set(dto.manifestIds || [])];
    if (manifestIds.length === 0) {
      throw new BadRequestException(
        'AUDITOR_GRANT_SCOPE_REQUIRED: select the evidence manifests to share (T09)',
      );
    }
    const res = await this.prisma.emailEvidenceManifest.updateMany({
      where: { tenant_id: tenantId, id: { in: manifestIds } },
      data: {
        auditor_principal_id: dto.auditorPrincipalId,
        auditor_grant_expires_at: expiresAt,
        auditor_grant_revoked_at: null,
      },
    });
    if (res.count !== manifestIds.length) {
      throw new NotFoundException(
        'One or more evidence manifests were not found for this tenant',
      );
    }

    await this.appendAudit(
      tenantId,
      actor.userId,
      'AUDITOR_ACCESS_GRANTED',
      dto.auditorPrincipalId,
      {
        auditorPrincipalId: dto.auditorPrincipalId,
        expiresAt: expiresAt.toISOString(),
        manifestIds,
      },
    );

    return {
      auditorPrincipalId: dto.auditorPrincipalId,
      expiresAt: expiresAt.toISOString(),
      manifestIds,
      scopedRole: 'SECURITY_AUDITOR',
    };
  }

  async listAccessGrants(tenantId: string) {
    const manifests = await this.prisma.emailEvidenceManifest.findMany({
      // tenant_id
      where: { tenant_id: tenantId, auditor_principal_id: { not: null } },
      orderBy: { created_at: 'desc' },
      take: 200,
    });
    const now = Date.now();
    return {
      grants: manifests.map((m) => ({
        manifestId: m.id,
        auditorPrincipalId: m.auditor_principal_id,
        expiresAt: m.auditor_grant_expires_at?.toISOString() ?? null,
        revokedAt: m.auditor_grant_revoked_at?.toISOString() ?? null,
        active:
          !m.auditor_grant_revoked_at &&
          m.auditor_grant_expires_at != null &&
          m.auditor_grant_expires_at.getTime() > now,
      })),
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
