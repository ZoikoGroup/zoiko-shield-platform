import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { AssessmentService } from './assessments/assessment.service';
import { AssessmentReviewService } from './review/assessment-review.service';
import { EvidenceGapService } from './evidence-gaps/evidence-gap.service';

@Controller('api/v1/assessments')
export class AssessmentsController {
  constructor(
    private readonly assessmentService: AssessmentService,
    private readonly assessmentReviewService: AssessmentReviewService,
    private readonly evidenceGapService: EvidenceGapService,
  ) {}

  @Get()
  async list(@Headers('x-tenant-id') tenantId: string) {
    return this.evidenceGapService.listOpenForTenant(tenantId ?? 'default-tenant');
  }

  @Post()
  async create(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-actor-id') actorId: string,
    @Body() body: { controlImplementationId: string; controlTestVersionId: string; periodStart: string; periodEnd: string },
  ) {
    return this.assessmentService.run({
      tenantId: tenantId ?? 'default-tenant',
      controlImplementationId: body.controlImplementationId,
      controlTestVersionId: body.controlTestVersionId,
      assessmentPeriodStart: new Date(body.periodStart),
      assessmentPeriodEnd: new Date(body.periodEnd),
      performerId: actorId,
    });
  }

  @Get(':id')
  async getById(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.assessmentService.getById(tenantId ?? 'default-tenant', id);
  }

  @Post(':id/review')
  async review(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-actor-id') actorId: string,
    @Param('id') id: string,
    @Body() body: { approve: boolean },
  ) {
    return this.assessmentReviewService.review({ tenantId: tenantId ?? 'default-tenant', assessmentId: id, reviewerId: actorId ?? 'unknown-actor', approve: body.approve });
  }

  @Get(':id/gaps')
  async gaps(@Headers('x-tenant-id') tenantId: string) {
    return this.evidenceGapService.listOpenForTenant(tenantId ?? 'default-tenant');
  }
}
