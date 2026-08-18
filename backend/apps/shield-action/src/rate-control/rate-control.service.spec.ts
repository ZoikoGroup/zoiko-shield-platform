import { RateControlService } from './rate-control.service';

function makePrisma(limit: any, count: number) {
  return {
    actionRateLimit: { findFirst: jest.fn().mockResolvedValue(limit) },
    actionCommand: { count: jest.fn().mockResolvedValue(count) },
  } as any;
}

describe('RateControlService', () => {
  it('allows when under the default ceiling with no configured limit', async () => {
    const prisma = makePrisma(null, 3);
    const service = new RateControlService(prisma);
    const result = await service.checkCeiling({
      tenantId: 't1',
      actionType: 'REVOKE_SESSIONS',
    });
    expect(result.allowed).toBe(true);
  });

  it('blocks when the count meets the configured maximum', async () => {
    const prisma = makePrisma({ maximum: 5, window: '1h' }, 5);
    const service = new RateControlService(prisma);
    const result = await service.checkCeiling({
      tenantId: 't1',
      actionType: 'REVOKE_SESSIONS',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Rate ceiling exceeded/);
  });

  it('allows when the count is below the configured maximum', async () => {
    const prisma = makePrisma({ maximum: 5, window: '1h' }, 4);
    const service = new RateControlService(prisma);
    const result = await service.checkCeiling({
      tenantId: 't1',
      actionType: 'REVOKE_SESSIONS',
    });
    expect(result.allowed).toBe(true);
  });
});
