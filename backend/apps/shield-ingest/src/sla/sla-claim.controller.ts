import {
  Controller,
  Get,
  Post,
  Query,
  Headers,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SLAClaimService, EvaluateClaimDto } from './sla-claim.service';

@Controller('api/v1/sla')
export class SLAClaimController {
  constructor(private readonly slaService: SLAClaimService) {}

  /**
   * POST /api/v1/sla/claims/evaluate
   * Run SLA claim eligibility evaluation
   */
  @Post('claims/evaluate')
  @HttpCode(HttpStatus.OK)
  async evaluateClaimEligibility(
    @Headers('x-tenant-id') headerTenantId: string,
    @Body() dto: EvaluateClaimDto,
  ) {
    if (!dto.tenantId) {
      dto.tenantId = headerTenantId || 'default-tenant';
    }
    const evaluation = await this.slaService.evaluateClaimEligibility(dto);
    return {
      statusCode: HttpStatus.OK,
      message: `Claim evaluation completed with status: ${evaluation.status}`,
      data: evaluation,
    };
  }

  /**
   * GET /api/v1/sla/claims/evaluations
   * Query claim evaluation history
   */
  @Get('claims/evaluations')
  async getClaimEvaluations(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
    @Query('claimKey') claimKey?: string,
  ) {
    const tenantId = headerTenantId || queryTenantId || 'default-tenant';
    const evaluations = await this.slaService.getClaimEvaluations(tenantId, claimKey);
    return {
      statusCode: HttpStatus.OK,
      data: evaluations,
    };
  }

  /**
   * GET /api/v1/sla/performance
   * Query tenant SLA performance & uptime metrics
   */
  @Get('performance')
  async getSLAPerformanceMetrics(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = headerTenantId || queryTenantId || 'default-tenant';
    const metrics = await this.slaService.getSLAPerformanceMetrics(tenantId);
    return {
      statusCode: HttpStatus.OK,
      data: metrics,
    };
  }
}
