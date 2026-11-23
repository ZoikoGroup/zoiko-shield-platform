import { ForbiddenException } from '@nestjs/common';
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

  it('M365 testConnection never fakes HEALTHY without live Graph credentials (T05)', async () => {
    const prev = process.env.MS_GRAPH_TEST_ACCESS_TOKEN;
    delete process.env.MS_GRAPH_TEST_ACCESS_TOKEN;
    try {
      const provider = new Microsoft365EmailProvider(
        new M365EmailNormalizerService(),
      );
      const health = await provider.testConnection(ctx);
      expect(health.status).toBe('UNVERIFIED');
    } finally {
      if (prev !== undefined) process.env.MS_GRAPH_TEST_ACCESS_TOKEN = prev;
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

  it('normalizes valid M365 Graph /security/alerts_v2 events into pseudonymized threat records (T02 / T17)', async () => {
    const prisma = {
      emailSourceConnection: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'conn-m365',
          tenant_id: 'tenant-1',
          environment_id: 'prod',
          residency_code: 'eu-west-1',
          provider: 'MICROSOFT_365',
          status: 'ACTIVE',
        }),
      },
      dlqMessage: { create: jest.fn() },
    } as any;

    const svc = new EmailReconciliationService(
      prisma,
      new Microsoft365EmailProvider(new M365EmailNormalizerService()),
      new M365EmailNormalizerService(),
      new GoogleWorkspaceAlertCenterProvider(),
    );

    const syncRes = await svc.syncRecords('tenant-1', 'conn-m365', [
      {
        id: 'graph-alert-001',
        title: 'Phishing campaign targeting finance',
        severity: 'HIGH',
        category: 'Phishing',
        createdDateTime: '2026-11-22T01:00:00Z',
        evidence: [
          {
            verdict: 'MALICIOUS',
            recipientEmailAddress: 'cfo@example.com',
            fileDetails: { sha256: 'deadbeef', fileName: 'invoice.pdf' },
          },
        ],
      },
    ]);

    expect(syncRes.status).toBe('HEALTHY_SYNCED');
    expect(syncRes.ingestedCount).toBe(1);
    expect(syncRes.normalizedRecords[0].subjectRef).toMatch(/^m365:/);
    expect(syncRes.normalizedRecords[0].subjectRef).not.toContain(
      'cfo@example.com',
    );
  });

  it('routes malformed records fail-closed to ingest.DlqMessage and blocks revoked collectors (T16 / T22)', async () => {
    const dlqCreate = jest.fn().mockResolvedValue({ id: 'dlq-1' });
    const prisma = {
      emailSourceConnection: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'conn-m365',
            tenant_id: 'tenant-1',
            environment_id: 'prod',
            residency_code: 'eu-west-1',
            provider: 'MICROSOFT_365',
            status: 'ACTIVE',
          })
          .mockResolvedValueOnce({
            id: 'conn-m365',
            tenant_id: 'tenant-1',
            provider: 'MICROSOFT_365',
            status: 'REVOKED',
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

    const syncRes = await svc.syncRecords('tenant-1', 'conn-m365', [
      { malformedWithoutIdOrTitle: true },
    ]);
    expect(syncRes.rejectedCount).toBe(1);
    expect(syncRes.status).toBe('DEGRADED');
    expect(dlqCreate).toHaveBeenCalledTimes(1);

    await expect(
      svc.syncRecords('tenant-1', 'conn-m365', [{ id: 'a1', title: 'test' }]),
    ).rejects.toThrow(ForbiddenException);
  });
});
