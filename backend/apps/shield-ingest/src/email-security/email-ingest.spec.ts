import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Microsoft365EmailProvider } from '../connectors/providers/microsoft-365-email/m365-email.provider';
import { M365EmailNormalizerService } from '../connectors/providers/microsoft-365-email/m365-email.normalizer';
import { GoogleWorkspaceAlertCenterProvider } from '../connectors/providers/google-workspace-alert-center/gw-alert-center.provider';
import { EmailReconciliationService } from './email-reconciliation.service';

describe('shield-ingest Email Security Providers (T02-T06, T16, T18, T22, S01, S02)', () => {
  const ctx = {
    connectorInstanceId: 'conn-email-1',
    tenantId: 'tenant-1',
    environmentId: 'prod',
    region: 'eu-west-1',
    purpose: 'security-monitoring',
    correlationId: 'corr-1',
    traceId: 'trace-1',
  };

  it('M365 provider rejects overbroad Mail.ReadWrite scope in Phase 0 (T18 / S01)', async () => {
    const provider = new Microsoft365EmailProvider(
      new M365EmailNormalizerService(),
    );
    const res = await provider.connect(ctx, {
      externalTenantId: 'azure-tenant-1',
      requestedScopes: ['SecurityAlert.Read.All', 'Mail.ReadWrite'],
    });
    expect(res.status).toBe('FAILED');
    expect(res.reasonCode).toBe('PHASE0_OVERBROAD_SCOPE_BLOCKED');
  });

  it('M365 testConnection never fakes HEALTHY without a per-tenant token, even if a global env token exists (T05)', async () => {
    const prev = process.env.MS_GRAPH_TEST_ACCESS_TOKEN;
    process.env.MS_GRAPH_TEST_ACCESS_TOKEN = 'global-token-must-be-ignored';
    try {
      const provider = new Microsoft365EmailProvider(
        new M365EmailNormalizerService(),
      );
      const health = await provider.testConnection(ctx);
      expect(health.status).toBe('UNVERIFIED');
    } finally {
      if (prev === undefined) delete process.env.MS_GRAPH_TEST_ACCESS_TOKEN;
      else process.env.MS_GRAPH_TEST_ACCESS_TOKEN = prev;
    }
  });

  it('Google Workspace Alert Center rejects unrestricted Gmail read scopes in Phase 0 (S02)', async () => {
    const provider = new GoogleWorkspaceAlertCenterProvider();
    const res = await provider.connect(ctx, {
      requestedScopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    });
    expect(res.status).toBe('FAILED');
    expect(res.reasonCode).toBe('GOOGLE_RESTRICTED_SCOPE_BLOCKED_IN_P0');
  });
});

describe('shield-ingest provider pull (gap J / EW04-05, T02, T03, T06, T16, T22)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function jsonResponse(
    status: number,
    body: unknown,
    headers: Record<string, string> = {},
  ) {
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
      json: async () => body,
    } as unknown as Response;
  }

  function graphAlert(id: string, created = '2026-11-22T01:00:00Z') {
    return {
      id,
      title: `Phishing ${id}`,
      severity: 'HIGH',
      category: 'Phishing',
      createdDateTime: created,
      evidence: [
        {
          verdict: 'MALICIOUS',
          recipientEmailAddress: 'cfo@example.com',
          fileDetails: { sha256: 'deadbeef', fileName: 'invoice.pdf' },
        },
      ],
    };
  }

  function build(
    provider: 'MICROSOFT_365' | 'GOOGLE_WORKSPACE',
    status = 'ACTIVE',
  ) {
    const dlqCreate = jest.fn().mockResolvedValue({ id: 'dlq-1' });
    const prisma = {
      emailSourceConnection: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'conn-1',
          tenant_id: 'tenant-1',
          environment_id: 'prod',
          residency_code: 'eu-west-1',
          provider,
          status,
        }),
      },
      dlqMessage: { create: dlqCreate },
    } as any;
    const svc = new EmailReconciliationService(
      prisma,
      new Microsoft365EmailProvider(new M365EmailNormalizerService()),
      new M365EmailNormalizerService(),
      new GoogleWorkspaceAlertCenterProvider(),
    );
    return { svc, dlqCreate };
  }

  it('pulls Graph alerts_v2 with the tenant token, follows nextLink and reconciles against @odata.count (T02)', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          value: [graphAlert('a1')],
          '@odata.count': 2,
          '@odata.nextLink':
            'https://graph.microsoft.com/v1.0/security/alerts_v2?$skiptoken=x',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          value: [graphAlert('a2', '2026-11-22T02:00:00Z')],
        }),
      );
    global.fetch = fetchMock as any;
    const { svc } = build('MICROSOFT_365');

    const res = await svc.syncFromProvider('tenant-1', 'conn-1', {
      accessToken: 'tenant-token',
      cursor: '2026-11-22T00:00:00Z',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstUrl = String(fetchMock.mock.calls[0][0]);
    expect(firstUrl).toContain('$count=true');
    expect(decodeURIComponent(firstUrl)).toContain(
      'createdDateTime gt 2026-11-22T00:00:00Z',
    );
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer tenant-token',
    );
    expect(res.status).toBe('SYNCED');
    expect(res.ingestedCount).toBe(2);
    expect(res.expectedCount).toBe(2);
    expect(res.completenessGrade).toBe('COMPLETE');
    expect(res.nextCursor).toBe('2026-11-22T02:00:00.000Z');
    expect(res.normalizedRecords[0].subjectRef).toMatch(/^m365:/);
    expect(JSON.stringify(res)).not.toContain('cfo@example.com');
    expect(JSON.stringify(res)).not.toContain('tenant-token');
  });

  it('reports UNKNOWN completeness when the provider gives no total (Google Alert Center)', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        alerts: [
          {
            alertId: 'g1',
            type: 'User reported phishing',
            createTime: '2026-11-22T03:00:00Z',
          },
        ],
      }),
    ) as any;
    const { svc } = build('GOOGLE_WORKSPACE');
    const res = await svc.syncFromProvider('tenant-1', 'conn-1', {
      accessToken: 'tenant-token',
    });
    expect(res.expectedCount).toBeNull();
    expect(res.completenessGrade).toBe('UNKNOWN');
    expect(res.ingestedCount).toBe(1);
  });

  it('turns a provider 429 into RATE_LIMITED with a gap and keeps the old cursor (T06)', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(429, {}, { 'retry-after': '30' }),
      ) as any;
    const { svc } = build('MICROSOFT_365');
    const res = await svc.syncFromProvider('tenant-1', 'conn-1', {
      accessToken: 't',
      cursor: '2026-11-22T00:00:00Z',
    });
    expect(res.status).toBe('RATE_LIMITED');
    expect(res.completenessGrade).toBe('DEGRADED');
    expect(res.gaps[0].reason).toBe('PROVIDER_429_RATE_LIMITED');
    expect(res.nextCursor).toBe('2026-11-22T00:00:00Z');
  });

  it('turns 401/403 into PERMISSION_REVOKED (T05)', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, {})) as any;
    const { svc } = build('MICROSOFT_365');
    const res = await svc.syncFromProvider('tenant-1', 'conn-1', {
      accessToken: 't',
    });
    expect(res.status).toBe('PERMISSION_REVOKED');
    expect(res.completenessGrade).toBe('DEGRADED');
  });

  it('flags a count mismatch, partial page limit and duplicate/malformed records (T03, T22)', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        value: [
          graphAlert('a1'),
          graphAlert('a1'),
          { malformedWithoutIdOrTitle: true },
        ],
        '@odata.count': 5,
      }),
    ) as any;
    const { svc, dlqCreate } = build('MICROSOFT_365');
    const res = await svc.syncFromProvider('tenant-1', 'conn-1', {
      accessToken: 't',
    });
    expect(res.duplicateCount).toBe(1);
    expect(res.rejectedCount).toBe(1);
    expect(dlqCreate).toHaveBeenCalledTimes(1);
    expect(res.status).toBe('DEGRADED');
    expect(res.completenessGrade).toBe('DEGRADED');

    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        value: [graphAlert('b1')],
        '@odata.count': 10,
        '@odata.nextLink':
          'https://graph.microsoft.com/v1.0/security/alerts_v2?$skiptoken=y',
      }),
    ) as any;
    const partial = await svc.syncFromProvider('tenant-1', 'conn-1', {
      accessToken: 't',
      cursor: '2026-11-22T00:00:00Z',
      maxPages: 1,
    });
    expect(partial.completenessGrade).toBe('PARTIAL');
    expect(partial.gaps.map((g) => g.reason)).toContain('PAGE_LIMIT_REACHED');
    expect(partial.nextCursor).toBe('2026-11-22T00:00:00Z');
  });

  it('never follows a nextLink off the Graph host with the bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        value: [graphAlert('a1')],
        '@odata.count': 2,
        '@odata.nextLink': 'https://evil.example/steal',
      }),
    );
    global.fetch = fetchMock as any;
    const { svc } = build('MICROSOFT_365');
    const res = await svc.syncFromProvider('tenant-1', 'conn-1', {
      accessToken: 't',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe('DEGRADED');
  });

  it('halts collection for REVOKED/SUSPENDED connections and rejects bad input (T16)', async () => {
    global.fetch = jest.fn() as any;
    for (const status of ['REVOKED', 'SUSPENDED']) {
      const { svc } = build('MICROSOFT_365', status);
      await expect(
        svc.syncFromProvider('tenant-1', 'conn-1', { accessToken: 't' }),
      ).rejects.toThrow(ForbiddenException);
      const test = await svc.testConnection('tenant-1', 'conn-1', 't');
      expect(test.status).toBe('PERMISSION_REVOKED');
      expect(test.capabilityReport.limitedCapability).toBe(true);
    }
    expect(global.fetch).not.toHaveBeenCalled();

    const { svc } = build('MICROSOFT_365');
    await expect(
      svc.syncFromProvider('tenant-1', 'conn-1', { accessToken: '' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      svc.syncFromProvider('tenant-1', 'conn-1', {
        accessToken: 't',
        cursor: "2026-11-22' or 1 eq 1",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('test connection returns an explicit capability report from a live probe only', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { value: [] })) as any;
    const { svc } = build('MICROSOFT_365');
    const ok = await svc.testConnection('tenant-1', 'conn-1', 'tenant-token');
    expect(ok.status).toBe('HEALTHY');
    expect(ok.capabilityReport.availableEventTypes).toEqual([
      'graph.security.alerts_v2',
    ]);
    expect(ok.capabilityReport.unavailableEventTypes).toContain(
      'exchange.mailbox.content',
    );

    const noToken = await svc.testConnection('tenant-1', 'conn-1');
    expect(noToken.status).toBe('UNVERIFIED');
    expect(noToken.capabilityReport.availableEventTypes).toEqual([]);
    expect(noToken.capabilityReport.limitedCapability).toBe(true);
  });
});
