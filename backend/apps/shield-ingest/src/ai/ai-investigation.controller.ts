import { Controller, Post, Param, Headers, Body, HttpStatus } from '@nestjs/common';

export class AiRunDecisionDto {
  reason?: string;
  editedContent?: string;
}

@Controller('api/v1')
export class AiInvestigationController {
  @Post('ai/cases/:caseId/summary')
  async getCaseSummary(
    @Headers('x-tenant-id') tenantId: string,
    @Param('caseId') caseId: string,
  ) {
    const aiRunId = `ai-run-${Date.now()}`;
    return {
      statusCode: HttpStatus.OK,
      data: {
        aiRunId,
        tenantId: tenantId || 'tenant-001',
        caseId,
        status: 'REVIEW_REQUIRED',
        summary: 'Multiple failed sign-in attempts were followed by a successful login.',
        citations: [
          { evidenceId: 'ev-1', description: 'Failed login events' },
          { evidenceId: 'ev-2', description: 'Successful login event' },
        ],
        recommendedActions: [
          'Verify user activity',
          'Review source IP reputation',
          'Consider resetting active user sessions',
        ],
        limitations: ['Device ownership could not be confirmed'],
        created: new Date().toISOString(),
      },
    };
  }

  @Post('ai/cases/:caseId/investigation-steps')
  async getInvestigationSteps(
    @Headers('x-tenant-id') tenantId: string,
    @Param('caseId') caseId: string,
  ) {
    const aiRunId = `ai-run-${Date.now()}`;
    return {
      statusCode: HttpStatus.OK,
      data: {
        aiRunId,
        caseId,
        steps: [
          'Query authentication logs for IP history over past 30 days',
          'Check user MFA enrollment and state',
          'Correlate concurrent user logins across regions',
        ],
        citations: [{ evidenceId: 'ev-1', description: 'Authentication logs' }],
      },
    };
  }

  @Post('ai/cases/:caseId/response-recommendation')
  async getResponseRecommendation(
    @Headers('x-tenant-id') tenantId: string,
    @Param('caseId') caseId: string,
  ) {
    const aiRunId = `ai-run-${Date.now()}`;
    return {
      statusCode: HttpStatus.OK,
      data: {
        aiRunId,
        caseId,
        recommendedAction: 'RESET_USER_SESSIONS',
        targetType: 'USER',
        authorityLevel: 'R1_RECOMMEND',
        reason: 'Suspicious credential activity pattern identified',
        citations: [{ evidenceId: 'ev-1', description: 'Sign-in audit log' }],
      },
    };
  }

  @Post('ai/runs/:aiRunId/accept')
  async acceptAiRun(
    @Param('aiRunId') aiRunId: string,
    @Body() dto: AiRunDecisionDto,
  ) {
    return {
      statusCode: HttpStatus.OK,
      message: 'AI recommendation ACCEPTED by analyst',
      aiRunId,
      humanReviewStatus: 'ACCEPTED',
      reason: dto?.reason,
    };
  }

  @Post('ai/runs/:aiRunId/edit')
  async editAiRun(
    @Param('aiRunId') aiRunId: string,
    @Body() dto: AiRunDecisionDto,
  ) {
    return {
      statusCode: HttpStatus.OK,
      message: 'AI recommendation EDITED by analyst',
      aiRunId,
      humanReviewStatus: 'EDITED',
      editedContent: dto?.editedContent,
    };
  }

  @Post('ai/runs/:aiRunId/reject')
  async rejectAiRun(
    @Param('aiRunId') aiRunId: string,
    @Body() dto: AiRunDecisionDto,
  ) {
    return {
      statusCode: HttpStatus.OK,
      message: 'AI recommendation REJECTED by analyst',
      aiRunId,
      humanReviewStatus: 'REJECTED',
      reason: dto?.reason,
    };
  }
}
