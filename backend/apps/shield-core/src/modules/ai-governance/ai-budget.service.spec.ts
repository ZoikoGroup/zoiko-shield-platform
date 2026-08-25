import { Test, TestingModule } from '@nestjs/testing';
import { AiBudgetService } from './ai-budget.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AiBudgetService (fail closed on missing budget)', () => {
  let service: AiBudgetService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      aiBudget: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      $transaction: jest.fn((callback: (tx: any) => unknown) =>
        callback(prismaMock),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiBudgetService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<AiBudgetService>(AiBudgetService);
  });

  it('treats a tenant with no configured budget as over-budget (fail closed)', async () => {
    prismaMock.aiBudget.findFirst.mockResolvedValue(null);

    const overBudget = await service.isOverBudget('t1', 'env-1');

    expect(overBudget).toBe(true);
  });

  it('is not over budget while consumed is below the configured amount', async () => {
    prismaMock.aiBudget.findFirst.mockResolvedValue({
      budget_amount: 1000,
      consumed_amount: 200,
    });

    const overBudget = await service.isOverBudget('t1', 'env-1');

    expect(overBudget).toBe(false);
  });

  it('flips to EXHAUSTED once spend reaches the budget amount', async () => {
    prismaMock.aiBudget.findFirst.mockResolvedValue({
      id: 'b-1',
      budget_amount: 100,
      consumed_amount: 90,
    });
    prismaMock.aiBudget.update.mockResolvedValue({
      id: 'b-1',
      status: 'EXHAUSTED',
    });

    const updated = await service.recordSpend('t1', 'env-1', 15);

    expect(updated!.status).toBe('EXHAUSTED');
  });
});
