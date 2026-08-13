import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { requireTenantId } from '../security/tenant-context';

export class CreateAssuranceReviewDto {
  tenantId?: string;
  periodName!: string;
  summary?: string;
  reviewedBy?: string;
}

export class CreateVCISOReflectionDto {
  tenantId?: string;
  assuranceReviewId?: string;
  category!: 'STRATEGIC_RISK' | 'POLICY_REMEDIATION' | 'SECURITY_ROADMAP' | 'AUDIT_READINESS';
  title!: string;
  notes!: string;
  actionItems?: string[];
  authorId?: string;
}

@Injectable()
export class AssuranceReviewService {
  private readonly logger = new Logger(AssuranceReviewService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Aggregate control test runs and generate an Assurance Review
   * Enforces "unknown is not false": empty test runs yield score 0.0 (NOT_EVALUATED)
   */
  async createAssuranceReview(dto: CreateAssuranceReviewDto) {
    if (!dto.periodName || dto.periodName.trim().length === 0) {
      throw new BadRequestException('Assurance review periodName is required');
    }

    const tenantId = requireTenantId(dto.tenantId);
    const actorId = dto.reviewedBy || 'system';

    const testRuns = await this.prisma.controlTestRun.findMany({
      where: { tenant_id: tenantId },
      orderBy: { executed_at: 'desc' },
    });

    let passedCount = 0;
    let failedCount = 0;

    for (const run of testRuns) {
      if (run.result === 'PASS') {
        passedCount++;
      } else if (run.result === 'FAIL' || run.result === 'DEGRADED') {
        failedCount++;
      }
    }

    const totalControls = passedCount + failedCount;
    const overallScore = totalControls > 0 ? Number(((passedCount / totalControls) * 100).toFixed(1)) : 0.0;
    const status = totalControls > 0 ? 'PUBLISHED' : 'NOT_EVALUATED';

    const review = await this.prisma.assuranceReview.create({
      data: {
        tenant_id: tenantId,
        title: dto.periodName,
        status,
        score: overallScore,
      },
    });

    this.logger.log(`Created AssuranceReview '${review.id}' for '${tenantId}' (Score: ${overallScore}%)`);

    return {
      ...review,
      overall_score: overallScore,
      passed_controls_count: passedCount,
      failed_controls_count: failedCount,
      periodName: dto.periodName,
      passedControlsCount: passedCount,
      failedControlsCount: failedCount,
      summary: dto.summary || `Automated posture assessment for ${dto.periodName} with ${overallScore}% control compliance.`,
      reviewedBy: actorId,
    };
  }

  /**
   * Query assurance reviews for tenant
   */
  async getAssuranceReviews(tenantId: string) {
    return this.prisma.assuranceReview.findMany({
      where: { tenant_id: tenantId },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Calculate real-time executive compliance posture summary
   */
  async getAssurancePostureSummary(tenantId: string) {
    const [reviews, controls, testRuns] = await Promise.all([
      this.prisma.assuranceReview.findMany({
        where: { tenant_id: tenantId },
        take: 1,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.controlObjective.findMany({ where: { owner: tenantId } }),
      this.prisma.controlTestRun.findMany({
        where: { tenant_id: tenantId },
        orderBy: { executed_at: 'desc' },
      }),
    ]);

    const latestReview = reviews[0] || null;
    const totalControls = controls.length;
    let effectiveCount = 0;
    let failedCount = 0;

    for (const run of testRuns) {
      if (run.result === 'PASS') effectiveCount++;
      else if (run.result === 'FAIL') failedCount++;
    }

    const overallScore = latestReview ? latestReview.score : 0.0;

    return {
      tenantId,
      overallScore,
      totalControlObjectives: totalControls,
      effectiveControlsCount: effectiveCount,
      failedControlsCount: failedCount,
      complianceFrameworks: ['SOC2', 'ISO27001', 'ZOIKO_SHIELD_BASELINE'],
      latestReviewPeriod: latestReview ? latestReview.title : 'NOT_EVALUATED',
      updatedAt: new Date(),
    };
  }

  async createVCISOReflection(dto: CreateVCISOReflectionDto) {
    if (!dto.title || !dto.notes) {
      throw new BadRequestException('Reflection title and notes are required');
    }

    const tenantId = requireTenantId(dto.tenantId);
    if (dto.assuranceReviewId) {
      const review = await this.prisma.assuranceReview.findFirst({
        where: { id: dto.assuranceReviewId, tenant_id: tenantId },
        select: { id: true },
      });
      if (!review) {
        throw new NotFoundException(`Assurance review '${dto.assuranceReviewId}' not found`);
      }
    }

    return this.prisma.vCISOReflection.create({
      data: {
        tenant_id: tenantId,
        assurance_review_id: dto.assuranceReviewId,
        category: dto.category,
        title: dto.title,
        notes: dto.notes,
        action_items: JSON.stringify(dto.actionItems ?? []),
        author_id: dto.authorId ?? 'system',
      },
    });
  }

  async getVCISOReflections(tenantId: string, assuranceReviewId?: string) {
    return this.prisma.vCISOReflection.findMany({
      where: { tenant_id: tenantId, ...(assuranceReviewId ? { assurance_review_id: assuranceReviewId } : {}) },
      orderBy: { created_at: 'desc' },
    });
  }
}
