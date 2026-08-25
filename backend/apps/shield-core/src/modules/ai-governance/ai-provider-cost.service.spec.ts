import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { AiProviderCostService } from './ai-provider-cost.service';

describe('AiProviderCostService (AI-02)', () => {
  it('records provider repricing as an internal event without changing customer price', async () => {
    const prisma: any = {
      aiGovernanceProfile: {
        findFirst: jest.fn().mockResolvedValue({ id: 'profile-1' }),
      },
      aiProviderCostEvent: {
        create: jest.fn().mockImplementation(async ({ data }: any) => data),
      },
    };
    const module = await Test.createTestingModule({
      providers: [
        AiProviderCostService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    const service = module.get(AiProviderCostService);

    const result = await service.record({
      tenantId: 'tenant-1',
      environmentId: 'prod',
      governanceProfileId: 'profile-1',
      provider: 'anthropic',
      model: 'claude',
      modelClass: 'STANDARD',
      providerPriceVersion: '2026-08-25',
      priorUnitCost: 0.01,
      newUnitCost: 0.02,
      costUnit: 'WORKFLOW',
      effectiveAt: new Date(),
      sourceReference: 'provider-notice-44',
      recordedBy: 'finops-feed',
    });

    expect(result.customer_price_changed).toBe(false);
    expect(prisma.aiProviderCostEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ customer_price_changed: false }),
    });
    expect(prisma.priceBook).toBeUndefined();
  });
});
