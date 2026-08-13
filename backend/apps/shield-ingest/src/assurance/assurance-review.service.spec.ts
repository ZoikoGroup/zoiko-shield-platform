import { Test, TestingModule } from '@nestjs/testing';
import { AssuranceReviewService } from './assurance-review.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AssuranceReviewService (Step 14)', () => {
  let service: AssuranceReviewService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      assuranceReview: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      controlObjective: {
        findMany: jest.fn(),
      },
      controlTestRun: {
        findMany: jest.fn(),
      },
      vCISOReflection: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssuranceReviewService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<AssuranceReviewService>(AssuranceReviewService);
  });

  it('should generate AssuranceReview with calculated posture score', async () => {
    prismaMock.controlTestRun.findMany.mockResolvedValue([
      { result: 'PASS' },
      { result: 'PASS' },
      { result: 'FAIL' },
    ]);

    prismaMock.assuranceReview.create.mockImplementation(
      ({ data }: { data: any }) => Promise.resolve({ id: 'rev-1', ...data }),
    );

    const review = await service.createAssuranceReview({
      tenantId: 'tenant-1',
      periodName: '2026-Q3 Assurance Review',
    });

    expect(review.id).toBe('rev-1');
    expect(review.overall_score).toBe(66.7);
    expect(review.passed_controls_count).toBe(2);
    expect(review.failed_controls_count).toBe(1);
  });

  it('should create vCISO strategic reflection', async () => {
    prismaMock.vCISOReflection.create.mockImplementation(
      ({ data }: { data: any }) => Promise.resolve({ id: 'ref-1', ...data }),
    );

    const reflection = await service.createVCISOReflection({
      tenantId: 'tenant-1',
      category: 'STRATEGIC_RISK',
      title: 'MFA Enforcement Action Plan',
      notes: 'Recommend enforcing FIDO2 keys for all admins.',
    });

    expect(reflection.id).toBe('ref-1');
    expect(reflection.category).toBe('STRATEGIC_RISK');
  });
});
