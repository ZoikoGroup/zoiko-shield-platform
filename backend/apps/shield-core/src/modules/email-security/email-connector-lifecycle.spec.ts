import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { EmailSecurityService } from './email-security.service';

/**
 * ZS-UX-EMTI-001 connector lifecycle, OAuth callback, consent expiry, Zoiko Mail
 * binding, optimistic concurrency and scoped auditor access.
 */
describe('Email connector lifecycle and spec gaps (WF-02/03/04/09, T04/T05/T09/E07)', () => {
  const tenantId = 'tenant-1';
  const admin = { userId: 'admin-1', email: 'a@x', roleCodes: ['SOC_ADMIN'] };
  const auditor = {
    userId: 'aud-1',
    email: 'au@x',
    roleCodes: ['SECURITY_AUDITOR'],
  };
  const env = { ...process.env };

  function build() {
    const prisma: any = {
      emailSourceConnection: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(async ({ data }: any) => ({ id: 'conn-new', ...data })),
        update: jest.fn(async ({ data }: any) => ({ id: 'conn-1', ...data })),
      },
      emailConnectionIntent: {
        create: jest.fn(async ({ data }: any) => ({ id: 'int-1', ...data })),
        findFirst: jest.fn(),
        update: jest.fn(async ({ data }: any) => ({ id: 'int-1', ...data })),
      },
      sourceCoverageWindow: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(async ({ data }: any) => ({ id: 'w-1', ...data })),
      },
      emailThreatFinding: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(async ({ data }: any) => ({ id: 'f-new', ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      emailThreatAdjudication: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'adj-1' }),
      },
      emailDetectionDecision: {
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      emailEvidenceManifest: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      emailAccessAuditEvent: {
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
    const ingestClient: any = {
      testEmailSource: jest.fn(),
      syncEmailSource: jest.fn(),
    };
    const vault: any = {
      assertConfigured: jest.fn(),
      store: jest.fn().mockResolvedValue('sec-1'),
      reveal: jest.fn().mockResolvedValue('secret'),
      revoke: jest.fn().mockResolvedValue(1),
      hasActive: jest.fn().mockResolvedValue(false),
    };
    const oauth: any = {
      isConfigured: jest.fn().mockReturnValue(true),
      buildAuthorizationUrl: jest.fn().mockReturnValue('https://idp/authorize'),
      exchangeCode: jest.fn(),
      refreshAccessToken: jest.fn().mockResolvedValue({
        accessToken: 'at',
        refreshToken: null,
        expiresInSeconds: 3600,
        grantedScopes: [],
      }),
    };
    const service = new EmailSecurityService(
      prisma,
      {} as any,
      ingestClient,
      {} as any,
      {} as any,
      {} as any,
      vault,
      oauth,
    );
    return { service, prisma, ingestClient, vault, oauth };
  }

  const openIntent = (over: Record<string, unknown> = {}) => ({
    id: 'int-1',
    tenant_id: tenantId,
    provider: 'MICROSOFT_365',
    requested_mode: 'READ_ONLY_TELEMETRY',
    oauth_state: 'st-1',
    pkce_verifier_ref: 'sec-pkce',
    status: 'CONSENT_PENDING',
    requested_scopes: [],
    residency_code: 'eu-west-1',
    expires_at: new Date(Date.now() + 60_000),
    verification_report: { displayName: 'M365' },
    ...over,
  });

  afterEach(() => {
    process.env = { ...env };
  });

  describe('connection intent and OAuth callback (WF-03, T04)', () => {
    it('refuses to start when the provider OAuth client is not configured', async () => {
      const { service, oauth, prisma } = build();
      oauth.isConfigured.mockReturnValue(false);
      await expect(
        service.createConnectionIntent(tenantId, admin, {
          provider: 'MICROSOFT_365',
          displayName: 'M365',
          requestedScopes: [],
        }),
      ).rejects.toThrow(/PROVIDER_OAUTH_NOT_CONFIGURED/);
      expect(prisma.emailConnectionIntent.create).not.toHaveBeenCalled();
    });

    it('keeps the PKCE verifier server-side and never returns state', async () => {
      const { service, vault } = build();
      const res = await service.createConnectionIntent(tenantId, admin, {
        provider: 'MICROSOFT_365',
        displayName: 'M365',
        requestedScopes: [],
      });
      expect(res.authorizationUrl).toBe('https://idp/authorize');
      expect(res).not.toHaveProperty('oauthState');
      expect(vault.store).toHaveBeenCalledWith(
        expect.objectContaining({ purpose: 'PKCE_VERIFIER', tenantId }),
      );
    });

    it('rejects an unknown or other-tenant state', async () => {
      const { service, prisma, oauth } = build();
      prisma.emailConnectionIntent.findFirst.mockResolvedValue(null);
      await expect(
        service.handleOAuthCallback(tenantId, admin, {
          state: 'forged',
          code: 'c',
        }),
      ).rejects.toThrow(/OAUTH_STATE_MISMATCH/);
      expect(prisma.emailConnectionIntent.findFirst).toHaveBeenCalledWith({
        where: { oauth_state: 'forged', tenant_id: tenantId },
      });
      expect(oauth.exchangeCode).not.toHaveBeenCalled();
    });

    it('records a provider denial and shreds the verifier', async () => {
      const { service, prisma, vault } = build();
      prisma.emailConnectionIntent.findFirst.mockResolvedValue(openIntent());
      const res = await service.handleOAuthCallback(tenantId, admin, {
        state: 'st-1',
        error: 'access_denied',
      });
      expect(res.status).toBe('DENIED');
      expect(res.connection).toBeNull();
      expect(vault.revoke).toHaveBeenCalledWith(tenantId, {
        intentId: 'int-1',
      });
    });

    it('expires a stale intent instead of exchanging the code', async () => {
      const { service, prisma, oauth } = build();
      prisma.emailConnectionIntent.findFirst.mockResolvedValue(
        openIntent({ expires_at: new Date(Date.now() - 1000) }),
      );
      const res = await service.handleOAuthCallback(tenantId, admin, {
        state: 'st-1',
        code: 'c',
      });
      expect(res.status).toBe('EXPIRED');
      expect(oauth.exchangeCode).not.toHaveBeenCalled();
    });

    it('rejects provider-granted write scopes in Phase 0 (S01/T18)', async () => {
      const { service, prisma, oauth } = build();
      prisma.emailConnectionIntent.findFirst.mockResolvedValue(openIntent());
      oauth.exchangeCode.mockResolvedValue({
        accessToken: 'a',
        refreshToken: 'r',
        expiresInSeconds: 1,
        grantedScopes: ['Mail.ReadWrite'],
      });
      await expect(
        service.handleOAuthCallback(tenantId, admin, {
          state: 'st-1',
          code: 'c',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.emailSourceConnection.create).not.toHaveBeenCalled();
    });

    it('stores the refresh token in the vault and starts VALIDATING with a consent expiry', async () => {
      const { service, prisma, oauth, vault } = build();
      prisma.emailConnectionIntent.findFirst.mockResolvedValue(openIntent());
      oauth.exchangeCode.mockResolvedValue({
        accessToken: 'a',
        refreshToken: 'r',
        expiresInSeconds: 1,
        grantedScopes: ['https://graph.microsoft.com/SecurityAlert.Read.All'],
      });
      // Prisma update returns the full row.
      prisma.emailSourceConnection.update.mockImplementationOnce(
        async ({ data }: any) => ({
          ...prisma.emailSourceConnection.create.mock.calls[0][0].data,
          id: 'conn-new',
          ...data,
        }),
      );
      const res = await service.handleOAuthCallback(tenantId, admin, {
        state: 'st-1',
        code: 'c',
      });
      expect(res.connection?.status).toBe('VALIDATING');
      expect(res.connection).not.toHaveProperty('credential_ref');
      const created = prisma.emailSourceConnection.create.mock.calls[0][0].data;
      expect(created.consent_expires_at).toBeInstanceOf(Date);
      expect(vault.store).toHaveBeenCalledWith(
        expect.objectContaining({
          purpose: 'OAUTH_REFRESH_TOKEN',
          plaintext: 'r',
        }),
      );
    });
  });

  describe('test, activate and consent expiry (WF-02/04, T05)', () => {
    const conn = (over: Record<string, unknown> = {}) => ({
      id: 'conn-1',
      tenant_id: tenantId,
      provider: 'MICROSOFT_365',
      status: 'VALIDATING',
      credential_ref: 'sec-1',
      capabilities: {},
      consent_expires_at: new Date(Date.now() + 86_400_000),
      ...over,
    });

    it('a handshake without provider data does not pass the test', async () => {
      const { service, prisma, ingestClient } = build();
      prisma.emailSourceConnection.findFirst.mockResolvedValue(conn());
      ingestClient.testEmailSource.mockResolvedValue({
        data: {
          status: 'HEALTHY',
          capabilityReport: { availableEventTypes: [] },
        },
      });
      const res = await service.testConnector(tenantId, admin, 'conn-1');
      expect(res.passed).toBe(false);
    });

    it('activation requires a recent passing test', async () => {
      const { service, prisma } = build();
      prisma.emailSourceConnection.findFirst.mockResolvedValue(
        conn({ last_test_status: 'FAILED' }),
      );
      await expect(
        service.activateConnector(tenantId, admin, 'conn-1'),
      ).rejects.toThrow(/ACTIVATION_REQUIRES_PASSING_TEST/);
      prisma.emailSourceConnection.findFirst.mockResolvedValue(
        conn({
          last_test_status: 'PASSED',
          last_tested_at: new Date(),
          last_test_report: { capabilityReport: { limitedCapability: true } },
        }),
      );
      const activated = await service.activateConnector(
        tenantId,
        admin,
        'conn-1',
      );
      expect(activated.status).toBe('DEGRADED');
      expect(activated.status_reason).toBe('LIMITED_CAPABILITY');
    });

    it('expired consent is presented as SUSPENDED, blocks collection and activation (T05)', async () => {
      const { service, prisma } = build();
      const expired = conn({
        status: 'ACTIVE',
        consent_expires_at: new Date(Date.now() - 1000),
      });
      prisma.emailSourceConnection.findMany.mockResolvedValue([expired]);
      const [listed] = await service.listConnectors(tenantId);
      expect(listed.status).toBe('SUSPENDED');
      expect(listed.status_reason).toBe('CONSENT_EXPIRED');
      expect(listed).not.toHaveProperty('credential_ref');
      prisma.emailSourceConnection.findFirst.mockResolvedValue(expired);
      await expect(
        service.syncConnector(tenantId, admin, 'conn-1'),
      ).rejects.toThrow(/COLLECTION_HALTED/);
      await expect(
        service.activateConnector(tenantId, admin, 'conn-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('source health is STALE when the last sync is too old', async () => {
      const { service, prisma } = build();
      prisma.emailSourceConnection.findFirst.mockResolvedValue(
        conn({
          status: 'ACTIVE',
          last_sync_at: new Date(Date.now() - 3 * 3_600_000),
        }),
      );
      prisma.sourceCoverageWindow.findMany.mockResolvedValue([
        { source_health: 'HEALTHY_SYNCED' },
      ]);
      const health = await service.getSourceHealth(tenantId, 'conn-1');
      expect(health.sourceHealth).toBe('STALE');
    });

    it('revocation shreds credentials and clears the binding (T16)', async () => {
      const { service, prisma, vault } = build();
      prisma.emailSourceConnection.findFirst.mockResolvedValue(
        conn({ status: 'ACTIVE' }),
      );
      const res = await service.disconnectConnector(tenantId, admin, 'conn-1', {
        reason: 'offboard',
      });
      expect(vault.revoke).toHaveBeenCalledWith(tenantId, {
        connectionId: 'conn-1',
      });
      expect(res.status).toBe('REVOKED');
      const data = prisma.emailSourceConnection.update.mock.calls[0][0].data;
      expect(data.credential_ref).toBeNull();
    });
  });

  describe('Zoiko Mail binding (EW06, D05)', () => {
    it('is disabled until the integration is approved', async () => {
      const { service } = build();
      delete process.env.EMAIL_ZOIKO_MAIL_INTEGRATION_ENABLED;
      const mail = service
        .listProviders()
        .find((p) => p.provider === 'ZOIKO_MAIL');
      expect(mail?.enabled).toBe(false);
      expect(mail?.reasonDisabled).toMatch(/ADR-ZSSEC-01/);
      await expect(
        service.createMailBinding(tenantId, admin, { displayName: 'Mail' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects an unknown binding with a structured 403', async () => {
      process.env.EMAIL_ZOIKO_MAIL_INTEGRATION_ENABLED = 'true';
      const { service, prisma } = build();
      prisma.emailSourceConnection.findFirst.mockResolvedValue(null);
      await expect(
        service.ingestMailEvent({
          tenantBindingId: 'zmb_unknown',
          eventId: 'e1',
          eventType: 'mail.security.inbound_verdict.v1',
          producer: 'zoiko-mail-security',
          sourceEventId: 's1',
          occurredAt: new Date().toISOString(),
          observedAt: new Date().toISOString(),
          subjectRef: 'ref',
          dataClass: 'SECURITY_METADATA',
          coverageState: 'COMPLETE',
          payloadHash: 'sha256:x',
        }),
      ).rejects.toMatchObject({ response: { code: 'UNKNOWN_TENANT_BINDING' } });
    });

    it('creates a finding for the bound tenant and goes live on first event', async () => {
      process.env.EMAIL_ZOIKO_MAIL_INTEGRATION_ENABLED = 'true';
      const { service, prisma } = build();
      prisma.emailSourceConnection.findFirst.mockResolvedValue({
        id: 'conn-mail',
        tenant_id: tenantId,
        status: 'VALIDATING',
      });
      prisma.emailThreatFinding.findFirst.mockResolvedValue(null);
      const res = await service.ingestMailEvent({
        tenantBindingId: 'zmb_ok',
        eventId: 'e1',
        eventType: 'mail.security.inbound_verdict.v1',
        producer: 'zoiko-mail-security',
        sourceEventId: 's1',
        occurredAt: new Date().toISOString(),
        observedAt: new Date().toISOString(),
        subjectRef: 'ref',
        sourceVerdict: 'MALICIOUS',
        dataClass: 'SECURITY_METADATA',
        coverageState: 'COMPLETE',
        payloadHash: 'sha256:x',
      });
      expect(res).toMatchObject({ accepted: true, duplicate: false });
      const created = prisma.emailThreatFinding.create.mock.calls[0][0].data;
      expect(created.tenant_id).toBe(tenantId);
      expect(created.provider).toBe('ZOIKO_MAIL');
      expect(prisma.emailSourceConnection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      );
    });
  });

  describe('optimistic concurrency (E07)', () => {
    it('rejects an adjudication made on a stale version', async () => {
      const { service, prisma } = build();
      prisma.emailThreatFinding.findFirst.mockResolvedValue({
        id: 'f-1',
        version: 3,
        policy_version: 'v1',
      });
      await expect(
        service.recordAdjudication(tenantId, admin, 'f-1', {
          decision: 'CONFIRMED',
          rationale: 'r',
          idempotencyKey: 'k',
          expectedVersion: 2,
        }),
      ).rejects.toMatchObject({
        response: { code: 'STALE_VERSION', currentVersion: 3 },
      });
    });

    it('rejects when another analyst wins the compare-and-set', async () => {
      const { service, prisma } = build();
      prisma.emailThreatFinding.findFirst
        .mockResolvedValueOnce({ id: 'f-1', version: 1, policy_version: 'v1' })
        .mockResolvedValueOnce({ version: 2 });
      prisma.emailThreatFinding.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.recordAdjudication(tenantId, admin, 'f-1', {
          decision: 'BENIGN',
          rationale: 'r',
          idempotencyKey: 'k2',
          expectedVersion: 1,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a stale analysis decision', async () => {
      const { service, prisma } = build();
      prisma.emailDetectionDecision.findFirst.mockResolvedValue({
        id: 'd-1',
        version: 2,
      });
      await expect(
        service.decideAnalysis(tenantId, admin, 'd-1', {
          decision: 'BENIGN',
          expectedVersion: 1,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('scoped auditor evidence (T09) and search before pagination (WF-05)', () => {
    it('auditors only list manifests expressly shared with them and still live', async () => {
      const { service, prisma } = build();
      await service.listEvidenceManifests(tenantId, auditor);
      const where =
        prisma.emailEvidenceManifest.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        tenant_id: tenantId,
        auditor_principal_id: 'aud-1',
        auditor_grant_revoked_at: null,
      });
      expect(where.auditor_grant_expires_at.gt).toBeInstanceOf(Date);
    });

    it('a grant naming a manifest from another tenant is rejected', async () => {
      const { service, prisma } = build();
      prisma.emailEvidenceManifest.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.grantAuditorAccess(tenantId, admin, {
          auditorPrincipalId: 'aud-1',
          expiresInHours: 4,
          manifestIds: ['other-tenant-manifest'],
        }),
      ).rejects.toThrow(/not found/);
    });

    it('search is part of the tenant-scoped query, not a post-filter', async () => {
      const { service, prisma } = build();
      await service.listThreats(tenantId, admin, { search: 'evt-9' });
      const where = prisma.emailThreatFinding.findMany.mock.calls[0][0].where;
      expect(where.tenant_id).toBe(tenantId);
      expect(where.OR).toHaveLength(3);
    });

    it('sync cannot run before activation', async () => {
      const { service, prisma } = build();
      prisma.emailSourceConnection.findFirst.mockResolvedValue({
        id: 'conn-1',
        tenant_id: tenantId,
        provider: 'MICROSOFT_365',
        status: 'VALIDATING',
        credential_ref: 'sec-1',
      });
      await expect(
        service.syncConnector(tenantId, admin, 'conn-1'),
      ).rejects.toThrow(/CONNECTOR_NOT_ACTIVE/);
    });

    it('Zoiko Mail sources cannot be probed or pulled', async () => {
      const { service, prisma } = build();
      prisma.emailSourceConnection.findFirst.mockResolvedValue({
        id: 'conn-mail',
        tenant_id: tenantId,
        provider: 'ZOIKO_MAIL',
        status: 'ACTIVE',
      });
      await expect(
        service.testConnector(tenantId, admin, 'conn-mail'),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.syncConnector(tenantId, admin, 'conn-mail'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
