import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { TaxRuleService } from './tax-rule.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('TaxRuleService (ZS-COM-BILL-001 Part 10, fail closed)', () => {
  let service: TaxRuleService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      taxRule: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaxRuleService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<TaxRuleService>(TaxRuleService);
  });

  it('resolves null (fail closed) with no approved rule for the jurisdiction/class', async () => {
    prismaMock.taxRule.findFirst.mockResolvedValue(null);

    const result = await service.resolveTax('US-CA', 'SAAS', 1000);

    expect(result).toBeNull();
  });

  it('computes tax amount from an approved rule', async () => {
    prismaMock.taxRule.findFirst.mockResolvedValue({
      id: 'rule-1',
      rate_percent: 8.5,
      reverse_charge: false,
    });

    const result = await service.resolveTax('US-CA', 'SAAS', 1000);

    expect(result).toEqual({
      ruleId: 'rule-1',
      ratePercent: 8.5,
      reverseCharge: false,
      taxAmount: 85,
    });
  });

  it('a reverse-charge rule always resolves to 0 tax amount', async () => {
    prismaMock.taxRule.findFirst.mockResolvedValue({
      id: 'rule-2',
      rate_percent: 20,
      reverse_charge: true,
    });

    const result = await service.resolveTax('EU-DE', 'SAAS', 1000);

    expect(result?.taxAmount).toBe(0);
  });

  it('rejects approving a rule that is not in DRAFT', async () => {
    prismaMock.taxRule.findUnique.mockResolvedValue({
      id: 'rule-1',
      status: 'APPROVED',
    });

    await expect(service.approveRule('rule-1', 'finance')).rejects.toThrow(
      ConflictException,
    );
  });
});
