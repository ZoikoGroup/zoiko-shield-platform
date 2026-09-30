import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { IsOptional, IsString, IsIn } from 'class-validator';
import { InternalAuthGuard } from '../internal-client/internal-auth.guard';
import { TrainingExclusionWatermarkerService } from './training-exclusion-watermarker.service';
import {
  AdversarialEvaluationHarnessService,
  type AdversarialAttackVector,
} from './adversarial-evaluation-harness.service';

export class ApplyWatermarkDto {
  @IsString()
  promptPayload!: string;

  @IsOptional()
  @IsString()
  modelProvider?: string;
}

export class VerifyWatermarkDto {
  @IsString()
  watermarkedPayload!: string;
}

export class AdversarialEvalDto {
  @IsString()
  prompt!: string;

  @IsOptional()
  @IsString()
  @IsIn([
    'PROMPT_INJECTION_DIRECT',
    'PROMPT_INJECTION_INDIRECT',
    'SYSTEM_PROMPT_EXFILTRATION',
    'UNAUTHORIZED_TOOL_INVOCATION',
    'TRAINING_DATA_EXTRACTION',
    'DATA_POISONING_SIMULATION',
    'TOKEN_OVERFLOW_DOS',
  ])
  attackVector?:
    | 'PROMPT_INJECTION_DIRECT'
    | 'PROMPT_INJECTION_INDIRECT'
    | 'SYSTEM_PROMPT_EXFILTRATION'
    | 'UNAUTHORIZED_TOOL_INVOCATION'
    | 'TRAINING_DATA_EXTRACTION'
    | 'DATA_POISONING_SIMULATION'
    | 'TOKEN_OVERFLOW_DOS';
}

@UseGuards(InternalAuthGuard)
@Controller('api/v1/ai/safety')
export class AiSafetyDefenseController {
  constructor(
    private readonly watermarkerService: TrainingExclusionWatermarkerService,
    private readonly evaluationHarness: AdversarialEvaluationHarnessService,
  ) {}

  /**
   * POST /api/v1/ai/safety/watermark
   * Apply cryptographic training exclusion watermark and generate non-retention receipt.
   */
  @Post('watermark')
  applyWatermark(
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: ApplyWatermarkDto,
  ) {
    const effectiveTenantId = tenantId || 'tenant-default';
    const result = this.watermarkerService.applyTrainingExclusionWatermark(
      effectiveTenantId,
      dto.promptPayload,
      dto.modelProvider,
    );

    return {
      statusCode: HttpStatus.OK,
      data: result,
    };
  }

  /**
   * POST /api/v1/ai/safety/verify-watermark
   * Verify token integrity and non-retention metadata in a prompt payload.
   */
  @Post('verify-watermark')
  verifyWatermark(
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: VerifyWatermarkDto,
  ) {
    const effectiveTenantId = tenantId || 'tenant-default';
    const result = this.watermarkerService.verifyExclusionWatermark(
      effectiveTenantId,
      dto.watermarkedPayload,
    );

    return {
      statusCode: HttpStatus.OK,
      data: result,
    };
  }

  /**
   * POST /api/v1/ai/safety/adversarial-eval
   * Run real-time Model Armor evaluation against prompt injection or jailbreak patterns.
   */
  @Post('adversarial-eval')
  evaluatePrompt(
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: AdversarialEvalDto,
  ) {
    const effectiveTenantId = tenantId || 'tenant-default';
    const result = this.evaluationHarness.evaluatePrompt(
      effectiveTenantId,
      dto.prompt,
      dto.attackVector as AdversarialAttackVector,
    );

    return {
      statusCode: HttpStatus.OK,
      data: result,
    };
  }

  /**
   * GET /api/v1/ai/safety/harness-suite
   * Run full OWASP LLM Top 10 automated test harness suite.
   */
  @Get('harness-suite')
  runHarnessSuite(@Headers('x-tenant-id') tenantId: string) {
    const effectiveTenantId = tenantId || 'tenant-default';
    const report =
      this.evaluationHarness.runComprehensiveHarnessSuite(effectiveTenantId);

    return {
      statusCode: HttpStatus.OK,
      data: report,
    };
  }
}
