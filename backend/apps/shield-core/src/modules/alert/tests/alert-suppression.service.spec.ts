import { Test, TestingModule } from '@nestjs/testing';
import { AlertSuppressionService } from '../suppression/alert-suppression.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('AlertSuppressionService', () => {
  let service: AlertSuppressionService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      alertSuppressionRule: { create: jest.fn(), findMany: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertSuppressionService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = module.get<AlertSuppressionService>(AlertSuppressionService);
  });

  it('matches an active, in-window, scope-matching suppression rule', async () => {
    prismaMock.alertSuppressionRule.findMany.mockResolvedValue([
      {
        id: 'rule-1',
        detection_definition_id: 'def-1',
        identity_id: null,
        asset_id: null,
        reason: 'known test account',
      },
    ]);

    const match = await service.findActiveMatch({
      tenantId: 'tenant-a',
      detectionDefinitionId: 'def-1',
    });

    expect(match).toEqual({ id: 'rule-1', reason: 'known test account' });
  });

  it('does not match a rule scoped to a different detection definition', async () => {
    prismaMock.alertSuppressionRule.findMany.mockResolvedValue([
      {
        id: 'rule-1',
        detection_definition_id: 'def-OTHER',
        identity_id: null,
        asset_id: null,
        reason: 'irrelevant',
      },
    ]);

    const match = await service.findActiveMatch({
      tenantId: 'tenant-a',
      detectionDefinitionId: 'def-1',
    });

    expect(match).toBeNull();
  });

  it('does not apply a rule the query already excluded as expired (expires_at filter is server-side, but this proves the shape holds when findMany legitimately returns none)', async () => {
    prismaMock.alertSuppressionRule.findMany.mockResolvedValue([]);

    const match = await service.findActiveMatch({
      tenantId: 'tenant-a',
      detectionDefinitionId: 'def-1',
    });

    expect(match).toBeNull();
    expect(prismaMock.alertSuppressionRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: 'tenant-a',
          status: 'ACTIVE',
          OR: [{ expires_at: null }, { expires_at: { gt: expect.any(Date) } }],
        }),
      }),
    );
  });
});
