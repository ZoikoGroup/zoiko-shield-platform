import { EmailSecurityService } from './email-security.service';

/**
 * Cross-tenant negative test (spec QA-07/QA-08, SEC-INV-001): every database
 * read issued by a tenant-scoped service method must be filtered by that
 * tenant. A recording prisma double captures every query; the assertion is on
 * the query arguments, so it holds even when the method later throws on an
 * empty result.
 */
describe('EmailSecurityService tenant isolation (QA-08)', () => {
  type Call = { model: string; op: string; args: any };

  function build() {
    const calls: Call[] = [];
    const prisma: any = new Proxy(
      {},
      {
        get: (_t, model: string) => {
          if (model === '$transaction') return (fn: any) => fn(prisma);
          if (model === '$executeRaw') return async () => 1;
          return new Proxy(
            {},
            {
              get: (_m, op: string) => async (args: any) => {
                calls.push({ model, op, args });
                if (op === 'findMany' || op === 'groupBy') return [];
                if (op === 'count') return 0;
                return null;
              },
            },
          );
        },
      },
    );
    const service = new EmailSecurityService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, calls };
  }

  const TENANT_A = 'tenant-A';
  const ACTOR = {
    userId: 'u-1',
    email: 'a@example.com',
    roleCodes: ['SOC_ADMIN'],
  };
  const READ_OPS = new Set([
    'findMany',
    'findFirst',
    'findUnique',
    'count',
    'groupBy',
    'aggregate',
  ]);

  const cases: Array<[string, (s: EmailSecurityService) => Promise<unknown>]> =
    [
      ['listConnectors', (s) => s.listConnectors(TENANT_A)],
      ['getSourceCoverage', (s) => s.getSourceCoverage(TENANT_A)],
      ['listReconciliations', (s) => s.listReconciliations(TENANT_A)],
      ['getControlsCoverage', (s) => s.getControlsCoverage(TENANT_A)],
      ['listEvidenceManifests', (s) => s.listEvidenceManifests(TENANT_A)],
      ['listPolicies', (s) => s.listPolicies(TENANT_A)],
      ['getBehaviourOverview', (s) => s.getBehaviourOverview(TENANT_A)],
      ['listActions', (s) => s.listActions(TENANT_A)],
      ['getSettingsAndGovernance', (s) => s.getSettingsAndGovernance(TENANT_A)],
      ['getPrivacyInventory', (s) => s.getPrivacyInventory(TENANT_A)],
      ['verifyAuditChain', (s) => s.verifyAuditChain(TENANT_A)],
      ['getOverview', (s) => s.getOverview(TENANT_A, {})],
      [
        'getSourceHealth',
        (s) => s.getSourceHealth(TENANT_A, 'conn-of-tenant-B'),
      ],
      [
        'getThreatDetail',
        (s) => s.getThreatDetail(TENANT_A, ACTOR, 'finding-of-tenant-B'),
      ],
      [
        'getAnalysisDetail',
        (s) => s.getAnalysisDetail(TENANT_A, 'analysis-of-tenant-B'),
      ],
      ['listThreats', (s) => s.listThreats(TENANT_A, ACTOR, {} as any)],
    ];

  it.each(cases)('%s filters every read by tenant_id', async (_name, run) => {
    const { service, calls } = build();
    await run(service).catch(() => undefined);
    const reads = calls.filter((c) => READ_OPS.has(c.op));
    expect(reads.length).toBeGreaterThan(0);
    for (const c of reads) {
      const where = c.args?.where ?? {};
      const serialized = JSON.stringify(where);
      expect(`${c.model}.${c.op} ${serialized}`).toContain(TENANT_A);
      expect(serialized).toMatch(/tenant_id/);
    }
  });

  it('an id belonging to another tenant resolves to NotFound, not data', async () => {
    const { service } = build();
    await expect(
      service.getThreatDetail(TENANT_A, ACTOR, 'finding-of-tenant-B'),
    ).rejects.toThrow(/not found/i);
  });
});
