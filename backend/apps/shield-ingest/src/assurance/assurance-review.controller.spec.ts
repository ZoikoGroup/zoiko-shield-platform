import { Test, TestingModule } from '@nestjs/testing';
import { AssuranceReviewController } from './assurance-review.controller';
import { AssuranceReviewService } from './assurance-review.service';
import { HttpStatus } from '@nestjs/common';

describe('AssuranceReviewController', () => {
  let controller: AssuranceReviewController;
  let serviceMock: any;

  beforeEach(async () => {
    serviceMock = {
      createAssuranceReview: jest.fn(),
      getAssuranceReviews: jest.fn(),
      getAssurancePostureSummary: jest.fn(),
      createVCISOReflection: jest.fn(),
      getVCISOReflections: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssuranceReviewController],
      providers: [{ provide: AssuranceReviewService, useValue: serviceMock }],
    }).compile();

    controller = module.get<AssuranceReviewController>(
      AssuranceReviewController,
    );
  });

  it('should create assurance review and return CREATED status', async () => {
    const mockReview = { id: 'rev-1', overall_score: 100.0 };
    serviceMock.createAssuranceReview.mockResolvedValue(mockReview);

    const response = await controller.createAssuranceReview('tenant-1', {
      periodName: '2026-Q3 Review',
    });

    expect(response.statusCode).toBe(HttpStatus.CREATED);
    expect(response.data).toBe(mockReview);
  });

  it('should return executive posture summary with OK status', async () => {
    const mockSummary = { overallScore: 95.0, totalControlObjectives: 4 };
    serviceMock.getAssurancePostureSummary.mockResolvedValue(mockSummary);

    const response = await controller.getAssurancePostureSummary('tenant-1');
    expect(response.statusCode).toBe(HttpStatus.OK);
    expect(response.data).toBe(mockSummary);
  });
});
