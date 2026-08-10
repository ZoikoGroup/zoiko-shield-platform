import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
   */
  async createAssuranceReview(dto: CreateAssuranceReviewDto) {
    if (!dto.periodName || dto.periodName.trim().length === 0) {
      throw new BadRequestException('Assurance review periodName is required');
    }

    const tenantId = dto.tenantId || 'default-tenant';
    const actorId = dto.reviewedBy || 'system';

    // Fetch latest control test runs for tenant
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
    const overallScore = totalControls > 0 ? Number(((passedCount / totalControls) * 100).toFixed(1)) : 100.0;

    const review = await this.prisma.assuranceReview.create({
      data: {
        tenant_id: tenantId,
        period_name: dto.periodName,
        status: 'PUBLISHED',
        overall_score: overallScore,
        passed_controls_count: passedCount,
        failed_controls_count: failedCount,
        summary: dto.summary || `Automated posture assessment for ${dto.periodName} with ${overallScore}% control compliance.`,
        reviewed_by: actorId,
        published_at: new Date(),
      },
    });

    this.logger.log(`Created AssuranceReview '${review.id}' for '${tenantId}' (Score: ${overallScore}%)`);

    return review;
  }

  /**
   * Query assurance reviews for tenant
   */
  async getAssuranceReviews(tenantId: string) {
    return this.prisma.assuranceReview.findMany({
      where: { tenant_id: tenantId },
      include: {
        reflections: true,
      },
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
      this.prisma.controlObjective.findMany({
        where: { tenant_id: tenantId },
      }),
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

    const overallScore = latestReview ? latestReview.overall_score : 100.0;

    return {
      tenantId,
      overallScore,
      totalControlObjectives: totalControls,
      effectiveControlsCount: effectiveCount,
      failedControlsCount: failedCount,
      complianceFrameworks: ['SOC2', 'ISO27001', 'ZOIKO_SHIELD_BASELINE'],
      latestReviewPeriod: latestReview ? latestReview.period_name : 'N/A',
      updatedAt: new Date(),
    };
  }

  /**
   * Create vCISO Strategic Reflection
   */
  async createVCISOReflection(dto: CreateVCISOReflectionDto) {
    if (!dto.title || !dto.notes) {
      throw new BadRequestException('Reflection title and notes are required');
    }

    const tenantId = dto.tenantId || 'default-tenant';

    const reflection = await this.prisma.vCISOReflection.create({
      data: {
        tenant_id: tenantId,
        assurance_review_id: dto.assuranceReviewId,
        category: dto.category || 'STRATEGIC_RISK',
        title: dto.title,
        notes: dto.notes,
        action_items: JSON.stringify(dto.actionItems || []),
        author_id: dto.authorId || 'vCISO',
      },
    });

    this.logger.log(`Created vCISOReflection '${reflection.id}' under category '${reflection.category}'`);

    return reflection;
  }

  /**
   * Query vCISO strategic reflections
   */
  async getVCISOReflections(tenantId: string, assuranceReviewId?: string) {
    return this.prisma.vCISOReflection.findMany({
      where: {
        tenant_id: tenantId,
        ...(assuranceReviewId ? { assurance_review_id: assuranceReviewId } : {}),
      },
      orderBy: { created_at: 'desc' },
    });
  }
}
