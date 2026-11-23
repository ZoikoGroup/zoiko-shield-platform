import { Body, Controller, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { InternalAuthGuard } from '../internal-client/internal-auth.guard';
import {
  EmailBecAdjudicationService,
  type EvaluateEmailFindingInput,
} from './email-bec-adjudication.service';

@Controller('internal/v1/email-ai')
@UseGuards(InternalAuthGuard)
export class EmailAiController {
  constructor(
    private readonly adjudicationService: EmailBecAdjudicationService,
  ) {}

  @Post('evaluate')
  evaluate(@Body() body: EvaluateEmailFindingInput) {
    const data = this.adjudicationService.evaluateFinding(body);
    return { statusCode: HttpStatus.OK, data };
  }

  @Post('benchmark')
  benchmark(
    @Body()
    body: {
      decisions: Array<{
        nativeBaselineVerdict?: string | null;
        adjudicatedLabel?: string | null;
        abstained?: boolean;
        falsePositiveCostUsd?: number | null;
      }>;
    },
  ) {
    const data = this.adjudicationService.computeNativeBaselineComparison(
      body.decisions || [],
    );
    return { statusCode: HttpStatus.OK, data };
  }
}
