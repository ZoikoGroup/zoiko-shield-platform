import { Test, TestingModule } from '@nestjs/testing';
import { SLAClaimService } from './sla-claim.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SLAClaimService (Step 15)', () => {
  let service: SLAClaimService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      claimEvaluation: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      evidenceRecord: {
        findMany: jest.fn(),
      },
      case: {
        findUnique: jest.fn(),
      },
      connectorInstance: {
        count: jest.fn(),
      },
      controlTestRun: {
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SLAClaimService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<SLAClaimService>(SLAClaimService);
  });

  it('should evaluate CLAIM_15MIN_RESPONSE as QUALIFIED when response time <= 15 minutes', async () => {
    prismaMock.evidenceRecord.findMany.mockResolvedValue([{ id: 'ev-1' }]);
    prismaMock.case.findUnique.mockResolvedValue({
      id: 'case-1',
      created_at: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
      caseTimelines: [{ created_at: new Date() }],
    });
    prismaMock.claimEvaluation.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'eval-1', ...data }),
    );

    const evaluation = await service.evaluateClaimEligibility({
      tenantId: 'tenant-1',
      claimKey: 'CLAIM_15MIN_RESPONSE',
      caseId: 'case-1',
    });

    expect(evaluation.id).toBe('eval-1');
    expect(evaluation.status).toBe('QUALIFIED');
    expect(evaluation.response_time_minutes).toBeLessThanOrEqual(15.0);
  });

  it('should calculate tenant SLA performance metrics', async () => {
    prismaMock.claimEvaluation.findMany.mockResolvedValue([
      { status: 'QUALIFIED', response_time_minutes: 5.0 },
      { status: 'QUALIFIED', response_time_minutes: 10.0 },
    ]);

    const metrics = await service.getSLAPerformanceMetrics('tenant-1');
    expect(metrics.slaCompliancePercentage).toBe(100.0);
    expect(metrics.averageResponseTimeMinutes).toBe(7.5);
  });
});
