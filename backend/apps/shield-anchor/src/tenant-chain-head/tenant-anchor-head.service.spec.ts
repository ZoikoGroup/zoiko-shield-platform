import { TenantAnchorHeadService } from './tenant-anchor-head.service';

function makePrisma(head: any) {
  return {
    tenantAnchorHead: {
      findUnique: jest.fn().mockResolvedValue(head),
      upsert: jest.fn().mockResolvedValue(head),
      updateMany: jest.fn(),
    },
  } as any;
}

describe('TenantAnchorHeadService', () => {
  it('CAS succeeds when expectedVersion matches the current row version', async () => {
    const prisma = makePrisma({
      tenant_id: 't1',
      version: 0,
      last_anchor_sequence: 0,
    });
    prisma.tenantAnchorHead.updateMany.mockResolvedValue({ count: 1 });
    const service = new TenantAnchorHeadService(prisma);
    await expect(
      service.commitHead('t1', 0, {
        lastAnchorSequence: 1,
        lastCheckpointId: 'cp1',
        lastCheckpointHash: 'h1',
      }),
    ).resolves.toBeUndefined();
  });

  it('CAS fails closed (never forks) when a concurrent writer already advanced the version', async () => {
    const prisma = makePrisma({
      tenant_id: 't1',
      version: 0,
      last_anchor_sequence: 0,
    });
    prisma.tenantAnchorHead.updateMany.mockResolvedValue({ count: 0 });
    const service = new TenantAnchorHeadService(prisma);
    await expect(
      service.commitHead('t1', 0, {
        lastAnchorSequence: 1,
        lastCheckpointId: 'cp1',
        lastCheckpointHash: 'h1',
      }),
    ).rejects.toThrow();
  });

  it('creates a version:0 head on first use for a tenant', async () => {
    const prisma = makePrisma(null);
    const created = { tenant_id: 't1', version: 0, last_anchor_sequence: 0 };
    prisma.tenantAnchorHead.upsert.mockResolvedValue(created);
    const service = new TenantAnchorHeadService(prisma);
    const head = await service.readHead('t1');
    expect(head).toEqual(created);
  });
});
