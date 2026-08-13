import {
  Controller,
  Get,
  Post,
  Param,
  Headers,
  Body,
  HttpStatus,
} from '@nestjs/common';
import {
  HumanDecisionService,
  RecordHumanDecisionDto,
} from './human-decision.service';
import { requireTenantId } from '../security/tenant-context';

@Controller('api/v1/cases/:caseId/decisions')
export class HumanDecisionController {
  constructor(private readonly decisionService: HumanDecisionService) {}

  /**
   * POST /api/v1/cases/:caseId/decisions
   * Record analyst human decision
   */
  @Post()
  async recordDecision(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('caseId') caseId: string,
    @Body() dto: RecordHumanDecisionDto,
  ) {
    const decision = await this.decisionService.recordDecision(
      requireTenantId(headerTenantId),
      caseId,
      dto,
    );
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Human decision recorded successfully',
      data: decision,
    };
  }

  /**
   * GET /api/v1/cases/:caseId/decisions
   * Get human decisions for a case
   */
  @Get()
  async getDecisionsByCase(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('caseId') caseId: string,
  ) {
    const decisions = await this.decisionService.getDecisionsByCase(
      requireTenantId(headerTenantId),
      caseId,
    );
    return {
      statusCode: HttpStatus.OK,
      data: decisions,
    };
  }
}
