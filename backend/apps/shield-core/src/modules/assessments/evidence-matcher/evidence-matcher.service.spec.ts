import { EvidenceMatcherService } from './evidence-matcher.service';

function makePrisma(rule: any, records: any[]) {
  return {
    expectedEvidenceRule: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(rule),
    },
    evidenceRecord: { findMany: jest.fn().mockResolvedValue(records) },
    expectedEvidenceResult: { create: jest.fn(async ({ data }: any) => data) },
  } as any;
}

const baseRule = {
  id: 'rule1',
  evidence_type: 'MFA_STATUS',
  expected_source: 'entra',
  minimum_coverage: null,
};

describe('EvidenceMatcherService', () => {
  it('never maps "no error" to COMPLETE — absent evidence is MISSING by default', async () => {
    const prisma = makePrisma(baseRule, []);
    const service = new EvidenceMatcherService(prisma);
    const { coverageState, freshnessState, integrityState } =
      await service.match({
        tenantId: 't1',
        ruleId: 'rule1',
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-01-31'),
      });
    expect(coverageState).toBe('MISSING');
    expect(freshnessState).toBe('UNKNOWN');
    expect(integrityState).toBe('UNKNOWN');
  });

  it('narrows absence to COLLECTOR_UNHEALTHY only when an explicit health signal says so', async () => {
    const prisma = makePrisma(baseRule, []);
    const service = new EvidenceMatcherService(prisma);
    const { coverageState } = await service.match({
      tenantId: 't1',
      ruleId: 'rule1',
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-01-31'),
      sourceHealthState: 'UNHEALTHY',
    });
    expect(coverageState).toBe('COLLECTOR_UNHEALTHY');
  });

  it('reports STALE freshness when a matched record is not CURRENT — never silently treated as current', async () => {
    const prisma = makePrisma(baseRule, [
      { id: 'e1', freshness_state: 'STALE', integrity_state: 'VERIFIED' },
    ]);
    const service = new EvidenceMatcherService(prisma);
    const { freshnessState, coverageState } = await service.match({
      tenantId: 't1',
      ruleId: 'rule1',
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-01-31'),
    });
    expect(freshnessState).toBe('STALE');
    expect(coverageState).toBe('COMPLETE');
  });

  it('keeps integrity FAILED separate from coverage — cryptographically invalid evidence never upgrades coverage silently', async () => {
    const prisma = makePrisma(baseRule, [
      { id: 'e1', freshness_state: 'CURRENT', integrity_state: 'FAILED' },
    ]);
    const service = new EvidenceMatcherService(prisma);
    const { integrityState, coverageState } = await service.match({
      tenantId: 't1',
      ruleId: 'rule1',
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-01-31'),
    });
    expect(integrityState).toBe('FAILED');
    expect(coverageState).toBe('COMPLETE');
  });

  it('reports PARTIAL when observed count is below minimum_coverage', async () => {
    const prisma = makePrisma({ ...baseRule, minimum_coverage: 3 }, [
      { id: 'e1', freshness_state: 'CURRENT', integrity_state: 'VERIFIED' },
    ]);
    const service = new EvidenceMatcherService(prisma);
    const { coverageState } = await service.match({
      tenantId: 't1',
      ruleId: 'rule1',
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-01-31'),
    });
    expect(coverageState).toBe('PARTIAL');
  });
});
