import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { InternalAuthGuard } from '../internal-client/internal-auth.guard';
import { AiOutputService } from '../outputs/ai-output.service';
import {
  AiHumanReviewService,
  ReviewDecision,
} from '../outputs/ai-human-review.service';
import { AiDecisionLedgerService } from '../outputs/ai-decision-ledger.service';
import {
  EvaluationRunnerService,
  EvaluationTestCase,
} from '../evaluation/evaluation-runner.service';
import { GatewayRequestContext } from '../gateway/ai-gateway.service';

export class ReviewOutputRequestDto {
  context!: GatewayRequestContext;
  review!: {
    decision: ReviewDecision;
    rationale?: string;
    modifiedContent?: string;
  };
}

export class RunEvaluationRequestDto {
  useCaseKey!: string;
  testCases!: EvaluationTestCase[];
}

@Controller('internal/v1/ai/outputs')
@UseGuards(InternalAuthGuard)
export class AiOutputController {
  constructor(
    private readonly aiOutputService: AiOutputService,
    private readonly aiHumanReviewService: AiHumanReviewService,
    private readonly aiDecisionLedger: AiDecisionLedgerService,
    private readonly evaluationRunner: EvaluationRunnerService,
  ) {}

  @Get(':outputId')
  async getById(
    @Param('outputId') outputId: string,
    @Query('tenantId') tenantId: string,
  ) {
    return { data: await this.aiOutputService.getById(tenantId, outputId) };
  }

  @Get(':outputId/decision-record')
  async getDecisionRecord(
    @Param('outputId') outputId: string,
    @Query('tenantId') tenantId: string,
  ) {
    return {
      data: this.aiDecisionLedger.getDecisionRecord(tenantId, outputId),
    };
  }

  @Post('evaluations/run')
  async runEvaluation(@Body() dto: RunEvaluationRequestDto) {
    const report = await this.evaluationRunner.runEvaluationSuite(
      dto.useCaseKey,
      dto.testCases || [],
    );
    return { data: report };
  }

  @Post(':outputId/review')
  async review(
    @Param('outputId') outputId: string,
    @Body() dto: ReviewOutputRequestDto,
  ) {
    const review = await this.aiHumanReviewService.recordReview({
      tenantId: dto.context.tenantId,
      outputId,
      reviewerId: dto.context.actorId,
      decision: dto.review.decision,
      rationale: dto.review.rationale,
      modifiedContent: dto.review.modifiedContent,
      correlationId: dto.context.correlationId,
    });
    return { data: review };
  }
}
