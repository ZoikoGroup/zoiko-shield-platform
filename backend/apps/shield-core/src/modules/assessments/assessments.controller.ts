import { Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { AssessmentService } from './assessments/assessment.service';
import { AssessmentReviewService } from './review/assessment-review.service';
import { EvidenceGapService } from './evidence-gaps/evidence-gap.service';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { requireTenantId } from '../../tenant-context';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/assessments')
export class AssessmentsController {
  constructor(
    private readonly assessmentService: AssessmentService,
    private readonly assessmentReviewService: AssessmentReviewService,
    private readonly evidenceGapService: EvidenceGapService,
  ) {}

  @Get()
  async list(@Headers('x-tenant-id') tenantId: string) {
    return this.evidenceGapService.listOpenForTenant(requireTenantId(tenantId));
  }

  @Post()
  async create(
    @Headers('x-tenant-id') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { controlImplementationId: string; controlTestVersionId: string; periodStart: string; periodEnd: string },
  ) {
    return this.assessmentService.run({
      tenantId: requireTenantId(tenantId),
      controlImplementationId: body.controlImplementationId,
      controlTestVersionId: body.controlTestVersionId,
      assessmentPeriodStart: new Date(body.periodStart),
      assessmentPeriodEnd: new Date(body.periodEnd),
      performerId: user.id,
    });
  }

  @Get(':id')
  async getById(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.assessmentService.getById(requireTenantId(tenantId), id);
  }

  @Post(':id/review')
  async review(
    @Headers('x-tenant-id') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { approve: boolean },
  ) {
    return this.assessmentReviewService.review({ tenantId: requireTenantId(tenantId), assessmentId: id, reviewerId: user.id, approve: body.approve });
  }

  @Get(':id/gaps')
  async gaps(@Headers('x-tenant-id') tenantId: string) {
    return this.evidenceGapService.listOpenForTenant(requireTenantId(tenantId));
  }
}
