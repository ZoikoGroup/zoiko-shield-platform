import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpStatus,
} from '@nestjs/common';
import { HumanDecisionService, RecordHumanDecisionDto } from './human-decision.service';

@Controller('api/v1/cases/:caseId/decisions')
export class HumanDecisionController {
  constructor(private readonly decisionService: HumanDecisionService) {}

  /**
   * POST /api/v1/cases/:caseId/decisions
   * Record analyst human decision
   */
  @Post()
  async recordDecision(
    @Param('caseId') caseId: string,
    @Body() dto: RecordHumanDecisionDto,
  ) {
    const decision = await this.decisionService.recordDecision(caseId, dto);
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
  async getDecisionsByCase(@Param('caseId') caseId: string) {
    const decisions = await this.decisionService.getDecisionsByCase(caseId);
    return {
      statusCode: HttpStatus.OK,
      data: decisions,
    };
  }
}
