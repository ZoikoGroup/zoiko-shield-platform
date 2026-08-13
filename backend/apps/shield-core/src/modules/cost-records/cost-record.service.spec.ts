import { Test, TestingModule } from '@nestjs/testing';
import { CostRecordService } from './cost-record.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('CostRecordService (Part 26: internal economics, never customer-facing)', () => {
  let service: CostRecordService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = { costRecord: { create: jest.fn(), findMany: jest.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CostRecordService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<CostRecordService>(CostRecordService);
  });

  it('computes total_cost as quantity * unit_cost', async () => {
    prismaMock.costRecord.create.mockImplementation(({ data }: any) =>
      Promise.resolve(data),
    );

    const record = await service.recordCost({
      usageClass: 'CLOUD',
      provider: 'aws',
      periodStart: new Date(),
      periodEnd: new Date(),
      quantity: 100,
      unitCost: 0.05,
      allocationMethod: 'DIRECT',
      source: 'billing-export',
    });

    expect(record.total_cost).toBe(5);
  });

  it('sums total cost across records for a usage class', async () => {
    prismaMock.costRecord.findMany.mockResolvedValue([
      { total_cost: 10 },
      { total_cost: 25 },
    ]);

    const total = await service.getTotalCostByUsageClass(
      'AI',
      new Date(),
      new Date(),
    );

    expect(total).toBe(35);
  });
});
