import { FreezeControllerService } from './freeze-controller.service';

function makePrisma(freezes: any[]) {
  return { freeze: { findMany: jest.fn().mockResolvedValue(freezes) } } as any;
}

describe('FreezeControllerService', () => {
  it('blocks on a GLOBAL freeze regardless of tenant', async () => {
    const prisma = makePrisma([{ scope: 'GLOBAL', reason: 'incident', tenant_id: null, scope_ref: null }]);
    const service = new FreezeControllerService(prisma);
    const result = await service.isFrozen({ tenantId: 't1', actionType: 'REVOKE_SESSIONS' });
    expect(result.frozen).toBe(true);
    expect(result.reason).toMatch(/GLOBAL/);
  });

  it('blocks on a TENANT freeze for the matching tenant', async () => {
    const prisma = makePrisma([{ scope: 'TENANT', tenant_id: 't1', reason: 'maintenance', scope_ref: null }]);
    const service = new FreezeControllerService(prisma);
    const result = await service.isFrozen({ tenantId: 't1', actionType: 'REVOKE_SESSIONS' });
    expect(result.frozen).toBe(true);
  });

  it('does not block a different tenant', async () => {
    const prisma = makePrisma([{ scope: 'TENANT', tenant_id: 't2', reason: 'maintenance', scope_ref: null }]);
    const service = new FreezeControllerService(prisma);
    const result = await service.isFrozen({ tenantId: 't1', actionType: 'REVOKE_SESSIONS' });
    expect(result.frozen).toBe(false);
  });

  it('blocks on an ACTION_TYPE freeze matching action type', async () => {
    const prisma = makePrisma([{ scope: 'ACTION_TYPE', tenant_id: 't1', scope_ref: 'REVOKE_SESSIONS', reason: 'risk' }]);
    const service = new FreezeControllerService(prisma);
    const result = await service.isFrozen({ tenantId: 't1', actionType: 'REVOKE_SESSIONS' });
    expect(result.frozen).toBe(true);
  });

  it('returns not frozen when no active freeze matches', async () => {
    const prisma = makePrisma([]);
    const service = new FreezeControllerService(prisma);
    const result = await service.isFrozen({ tenantId: 't1', actionType: 'REVOKE_SESSIONS' });
    expect(result.frozen).toBe(false);
  });
});
