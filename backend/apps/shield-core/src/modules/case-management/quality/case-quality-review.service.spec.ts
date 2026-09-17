import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CaseQualityReviewService } from './case-quality-review.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CaseTimelineService } from '../timeline/case-timeline.service';

describe('CaseQualityReviewService', () => {
  let service: CaseQualityReviewService;
  let prismaMock: any;
  let timelineMock: any;

  beforeEach(async () => {
    prismaMock = {
      caseQualityReview: {
        create: jest
          .fn()
          .mockImplementation(({ data }: any) => ({ id: 'review-1', ...data })),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest
          .fn()
          .mockImplementation(({ data }: any) => ({ id: 'review-1', ...data })),
      },
    };
    timelineMock = { append: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CaseQualityReviewService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CaseTimelineService, useValue: timelineMock },
      ],
    }).compile();

    service = module.get(CaseQualityReviewService);
  });

  describe('requiresReview', () => {
    it('requires a closure review for a CRITICAL case being closed', () => {
      expect(
        service.requiresReview({ severity: 'CRITICAL', toState: 'CLOSED' }),
      ).toBe('CLOSURE_REVIEW');
    });

    it('requires a disposition review when a HIGH case records a disposition', () => {
      expect(
        service.requiresReview({
          severity: 'HIGH',
          toState: 'RESOLVED',
          disposition: 'FALSE_POSITIVE',
        }),
      ).toBe('DISPOSITION_REVIEW');
    });

    it('does not gate low-severity outcomes', () => {
      expect(
        service.requiresReview({ severity: 'LOW', toState: 'CLOSED' }),
      ).toBeNull();
      expect(
        service.requiresReview({
          severity: 'MEDIUM',
          toState: 'RESOLVED',
          disposition: 'DUPLICATE',
        }),
      ).toBeNull();
    });

    it('does not gate ordinary progress on a high-severity case', () => {
      expect(
        service.requiresReview({ severity: 'CRITICAL', toState: 'TRIAGED' }),
      ).toBeNull();
    });
  });

  it('opens a PENDING review and records it on the timeline', async () => {
    const review = await service.request({
      tenantId: 'tenant-a',
      caseId: 'case-1',
      reviewType: 'CLOSURE_REVIEW',
      requestedBy: 'analyst-1',
      trigger: 'CRITICAL case moving to CLOSED',
    });

    expect(review.status).toBe('PENDING');
    expect(review.requested_by).toBe('analyst-1');
    expect(timelineMock.append).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Quality review requested' }),
    );
  });

  it('reuses the open review instead of stacking duplicates', async () => {
    prismaMock.caseQualityReview.findFirst.mockResolvedValue({
      id: 'review-existing',
      status: 'PENDING',
    });

    const review = await service.request({
      tenantId: 'tenant-a',
      caseId: 'case-1',
      reviewType: 'CLOSURE_REVIEW',
      requestedBy: 'analyst-1',
      trigger: 'again',
    });

    expect(review.id).toBe('review-existing');
    expect(prismaMock.caseQualityReview.create).not.toHaveBeenCalled();
  });

  it('refuses to let the requester approve their own review (maker-checker)', async () => {
    prismaMock.caseQualityReview.findFirst.mockResolvedValue({
      id: 'review-1',
      case_id: 'case-1',
      status: 'PENDING',
      requested_by: 'analyst-1',
      review_type: 'CLOSURE_REVIEW',
    });

    await expect(
      service.decide({
        tenantId: 'tenant-a',
        reviewId: 'review-1',
        reviewerId: 'analyst-1',
        decision: 'APPROVED',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(prismaMock.caseQualityReview.update).not.toHaveBeenCalled();
  });

  it('lets a different reviewer approve, recording who decided and when', async () => {
    prismaMock.caseQualityReview.findFirst.mockResolvedValue({
      id: 'review-1',
      case_id: 'case-1',
      status: 'PENDING',
      requested_by: 'analyst-1',
      review_type: 'CLOSURE_REVIEW',
    });

    const decided = await service.decide({
      tenantId: 'tenant-a',
      reviewId: 'review-1',
      reviewerId: 'soc-lead',
      decision: 'APPROVED',
      comments: 'Evidence supports the closure',
    });

    expect(decided.status).toBe('APPROVED');
    expect(decided.reviewer_id).toBe('soc-lead');
    expect(decided.decided_at).toBeInstanceOf(Date);
  });

  it('refuses to decide a review twice', async () => {
    prismaMock.caseQualityReview.findFirst.mockResolvedValue({
      id: 'review-1',
      case_id: 'case-1',
      status: 'APPROVED',
      requested_by: 'analyst-1',
    });

    await expect(
      service.decide({
        tenantId: 'tenant-a',
        reviewId: 'review-1',
        reviewerId: 'soc-lead',
        decision: 'REJECTED',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('throws when the review does not exist for the tenant', async () => {
    prismaMock.caseQualityReview.findFirst.mockResolvedValue(null);

    await expect(
      service.decide({
        tenantId: 'tenant-a',
        reviewId: 'missing',
        reviewerId: 'soc-lead',
        decision: 'APPROVED',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
