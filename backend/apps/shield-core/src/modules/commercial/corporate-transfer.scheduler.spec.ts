import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { CorporateTransferScheduler } from './corporate-transfer.scheduler';
import { CorporateTransferService } from './corporate-transfer.service';

describe('CorporateTransferScheduler', () => {
  let scheduler: CorporateTransferScheduler;
  let prismaMock: any;
  let transferMock: any;

  beforeEach(async () => {
    prismaMock = {
      corporateTransfer: { findMany: jest.fn().mockResolvedValue([]) },
    };
    transferMock = { executeTransfer: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CorporateTransferScheduler,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CorporateTransferService, useValue: transferMock },
      ],
    }).compile();
    scheduler = module.get(CorporateTransferScheduler);
  });

  it('executes only approved transfers whose effective boundary has arrived', async () => {
    prismaMock.corporateTransfer.findMany.mockResolvedValue([
      {
        id: 'transfer-1',
        source_tenant_id: 'source-tenant',
        source_environment_id: 'source-prod',
      },
    ]);
    transferMock.executeTransfer.mockResolvedValue({ status: 'EXECUTED' });

    const result = await scheduler.executeDueTransfers();

    expect(prismaMock.corporateTransfer.findMany).toHaveBeenCalledWith({
      where: {
        status: 'APPROVED',
        effective_at: { lte: expect.any(Date) },
      },
      select: expect.any(Object),
      orderBy: { effective_at: 'asc' },
      take: 100,
    });
    expect(transferMock.executeTransfer).toHaveBeenCalledWith(
      'transfer-1',
      'source-tenant',
      'source-prod',
      'system:corporate-transfer-scheduler',
    );
    expect(result).toEqual({ attempted: 1, executed: 1, failed: 0 });
  });

  it('isolates one failed plan so other due transfers still execute', async () => {
    prismaMock.corporateTransfer.findMany.mockResolvedValue([
      {
        id: 'transfer-1',
        source_tenant_id: 'tenant-1',
        source_environment_id: 'prod',
      },
      {
        id: 'transfer-2',
        source_tenant_id: 'tenant-2',
        source_environment_id: 'prod',
      },
    ]);
    transferMock.executeTransfer
      .mockRejectedValueOnce(new Error('export prerequisite missing'))
      .mockResolvedValueOnce({ status: 'RECONCILIATION_PENDING' });

    await expect(scheduler.executeDueTransfers()).resolves.toEqual({
      attempted: 2,
      executed: 1,
      failed: 1,
    });
  });
});
