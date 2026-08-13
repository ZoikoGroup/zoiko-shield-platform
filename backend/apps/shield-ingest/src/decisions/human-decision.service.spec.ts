import { Test, TestingModule } from '@nestjs/testing';
import { HumanDecisionService } from './human-decision.service';
import { PrismaService } from '../prisma/prisma.service';

describe('HumanDecisionService (Step 16)', () => {
  let service: HumanDecisionService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      case: {
        findFirst: jest.fn(),
      },
      caseDecision: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      caseTimeline: {
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HumanDecisionService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<HumanDecisionService>(HumanDecisionService);
  });

  it('should record human decision and append DECISION_RECORDED event to CaseTimeline', async () => {
    prismaMock.case.findFirst.mockResolvedValue({
      id: 'case-1',
      tenant_id: 'tenant-1',
    });
    prismaMock.caseDecision.create.mockResolvedValue({
      id: 'dec-1',
      case_id: 'case-1',
      decision_type: 'TRIAGE_DECISION',
      decision: 'Escalate to L2 Analyst',
    });

    const result = await service.recordDecision('tenant-1', 'case-1', {
      decisionType: 'TRIAGE_DECISION',
      decision: 'Escalate to L2 Analyst',
      reason: 'Confirmed lateral movement pattern',
    });

    expect(result.id).toBe('dec-1');
    expect(prismaMock.caseDecision.create).toHaveBeenCalled();
    expect(prismaMock.caseTimeline.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entry_type: 'DECISION_RECORDED',
        case_id: 'case-1',
      }),
    });
  });
});
