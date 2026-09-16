import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CaseTimelineService } from '../timeline/case-timeline.service';

export type QualityReviewType = 'DISPOSITION_REVIEW' | 'CLOSURE_REVIEW';
export type QualityReviewDecision = 'APPROVED' | 'REJECTED';

/**
 * Risk-based second-person review of material case outcomes (ZS-ENG-DRS-001
 * §12/§23: "material dispositions and sampled closures require peer/supervisor
 * review based on risk").
 *
 * Modelled on CommercialApprovalService's maker-checker shape rather than the
 * in-memory dual-custody services in shield-action — a review that disappears
 * on restart can't evidence that a closure was ever reviewed.
 */
@Injectable()
export class CaseQualityReviewService {
  private readonly logger = new Logger(CaseQualityReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: CaseTimelineService,
  ) {}

  /**
   * Which outcomes are material enough to need a second pair of eyes.
   * Deliberately a deterministic severity rule rather than random sampling:
   * a reviewer can reason about "every CRITICAL/HIGH closure is reviewed",
   * and it can be widened to true percentage sampling later without changing
   * how the gate itself works.
   */
  requiresReview(params: {
    severity: string;
    toState: string;
    disposition?: string;
  }): QualityReviewType | null {
    const isClosure = params.toState === 'CLOSED';
    const isMaterialSeverity =
      params.severity === 'CRITICAL' || params.severity === 'HIGH';

    if (isClosure && isMaterialSeverity) return 'CLOSURE_REVIEW';
    // A disposition records *why* a case ended; getting it wrong on a
    // high-severity case misreports the outcome even if the state is right.
    if (params.disposition && isMaterialSeverity) return 'DISPOSITION_REVIEW';
    return null;
  }

  async request(params: {
    tenantId: string;
    caseId: string;
    reviewType: QualityReviewType;
    requestedBy: string;
    trigger: string;
  }) {
    const existing = await this.findPending(params.tenantId, params.caseId);
    if (existing) return existing;

    const review = await this.prisma.caseQualityReview.create({
      data: {
        tenant_id: params.tenantId,
        case_id: params.caseId,
        review_type: params.reviewType,
        trigger: params.trigger,
        requested_by: params.requestedBy,
        status: 'PENDING',
      },
    });

    await this.timeline.append({
      tenantId: params.tenantId,
      caseId: params.caseId,
      entryType: 'STATUS_CHANGED',
      actorId: params.requestedBy,
      title: 'Quality review requested',
      summary: `${params.reviewType} required: ${params.trigger}`,
    });

    this.logger.log(
      `Quality review ${review.id} (${params.reviewType}) opened for case '${params.caseId}'`,
    );
    return review;
  }

  async decide(params: {
    tenantId: string;
    reviewId: string;
    reviewerId: string;
    decision: QualityReviewDecision;
    comments?: string;
  }) {
    const review = await this.prisma.caseQualityReview.findFirst({
      where: { id: params.reviewId, tenant_id: params.tenantId },
    });
    if (!review) {
      throw new NotFoundException(
        `Quality review '${params.reviewId}' not found`,
      );
    }
    if (review.status !== 'PENDING') {
      throw new ConflictException(
        `Quality review '${params.reviewId}' is already ${review.status}`,
      );
    }
    if (review.requested_by === params.reviewerId) {
      throw new ForbiddenException(
        `Reviewer '${params.reviewerId}' cannot decide on a quality review they requested themselves (maker-checker violation)`,
      );
    }

    const updated = await this.prisma.caseQualityReview.update({
      where: { id: params.reviewId },
      data: {
        status: params.decision,
        reviewer_id: params.reviewerId,
        comments: params.comments,
        decided_at: new Date(),
      },
    });

    await this.timeline.append({
      tenantId: params.tenantId,
      caseId: review.case_id,
      entryType: 'STATUS_CHANGED',
      actorId: params.reviewerId,
      title: `Quality review ${params.decision.toLowerCase()}`,
      summary: params.comments ?? `${review.review_type} ${params.decision}`,
    });

    return updated;
  }

  async findPending(tenantId: string, caseId: string) {
    return this.prisma.caseQualityReview.findFirst({
      where: { tenant_id: tenantId, case_id: caseId, status: 'PENDING' },
      orderBy: { created_at: 'desc' },
    });
  }

  async listForCase(tenantId: string, caseId: string) {
    return this.prisma.caseQualityReview.findMany({
      where: { tenant_id: tenantId, case_id: caseId },
      orderBy: { created_at: 'desc' },
    });
  }

  /** True once a review for this case has been approved. */
  async hasApproval(tenantId: string, caseId: string) {
    const approved = await this.prisma.caseQualityReview.findFirst({
      where: { tenant_id: tenantId, case_id: caseId, status: 'APPROVED' },
    });
    return Boolean(approved);
  }
}
