import {
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OriginCsrfGuard } from '../common/origin-csrf.guard';
import { PublicEndpoint } from '../common/public-endpoint.decorator';
import { RateLimitGuard } from '../common/rate-limit.guard';
import {
  CreateKeyDto,
  IntakeBodyDto,
  SubmissionStatusDto,
  SummaryPreviewDto,
} from './intake.dto';
import { IntakeService } from './intake.service';
@Controller()
@PublicEndpoint()
@UseGuards(OriginCsrfGuard, RateLimitGuard)
export class IntakeController {
  constructor(private readonly intake: IntakeService) {}

  @Post('submissions/keys')
  @HttpCode(201)
  createKey(@Body() body: CreateKeyDto) {
    return this.intake.createKey(body.journey);
  }

  @Post('submissions/status')
  status(@Body() body: SubmissionStatusDto) {
    return this.intake.status(body.public_reference, body.status_token);
  }

  @Post('support/summary-preview')
  summaryPreview(@Body() body: SummaryPreviewDto) {
    return this.intake.summaryPreview(body.lines);
  }

  @Post('demo-requests')
  demo(@Body() body: IntakeBodyDto) {
    return this.intake.submit('demo', this.toRecord(body));
  }

  @Post('support/requests')
  support(@Body() body: IntakeBodyDto) {
    return this.intake.submit('support', this.toRecord(body));
  }

  @Post('commercial/inquiries')
  quote(@Body() body: IntakeBodyDto) {
    return this.intake.submit('quote', this.toRecord(body));
  }

  @Post('trust/access-requests')
  trust(@Body() body: IntakeBodyDto) {
    return this.intake.submit('trust', this.toRecord(body));
  }

  @Post('technical-reviews')
  technicalReview(@Body() body: IntakeBodyDto) {
    return this.intake.submit('tech', this.toRecord(body));
  }

  @Post('onboarding/requests')
  onboarding(@Body() body: IntakeBodyDto) {
    return this.intake.submit('onboarding', this.toRecord(body));
  }

  @Post('privacy/requests')
  privacy(@Body() body: IntakeBodyDto) {
    return this.intake.submit('privacy', this.toRecord(body));
  }

  private toRecord(body: IntakeBodyDto): Record<string, unknown> {
    return { ...body } as Record<string, unknown>;
  }
}
