import { Controller, Get, Param, Headers, UseGuards } from '@nestjs/common';
import { CommandCenterBffService } from './command-center-bff.service';
import { InternalAuthGuard } from '../../internal-client/internal-auth.guard';
import {
  ExperienceStateEnvelope,
  CommandCenterOverviewData,
  CaseTriageDetailData,
  EvidenceFreshnessData,
} from './interfaces/experience-state.interface';

/**
 * Customer & Analyst Experience Command Center BFF Controller
 * Specification: MASTER_BUILD_PLAN.md §7 Step 8 (Experience-Facing APIs / LAB 14)
 */
@Controller('api/v1/experience/command-center')
@UseGuards(InternalAuthGuard)
export class CommandCenterBffController {
  constructor(private readonly bffService: CommandCenterBffService) {}

  @Get('overview')
  async getOverview(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-correlation-id') correlationId = `corr-${Date.now()}`,
  ): Promise<ExperienceStateEnvelope<CommandCenterOverviewData>> {
    return this.bffService.getOverview(tenantId, correlationId);
  }

  @Get('cases/:caseId')
  async getCaseDetail(
    @Param('caseId') caseId: string,
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-correlation-id') correlationId = `corr-${Date.now()}`,
  ): Promise<ExperienceStateEnvelope<CaseTriageDetailData>> {
    return this.bffService.getCaseDetail(tenantId, caseId, correlationId);
  }

  @Get('evidence-freshness')
  async getEvidenceFreshness(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-correlation-id') correlationId = `corr-${Date.now()}`,
  ): Promise<ExperienceStateEnvelope<EvidenceFreshnessData>> {
    return this.bffService.getEvidenceFreshness(tenantId, correlationId);
  }
}
