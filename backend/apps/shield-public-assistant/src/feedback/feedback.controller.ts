import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { OriginCsrfGuard } from '../common/origin-csrf.guard';
import { PublicEndpoint } from '../common/public-endpoint.decorator';
import { RateLimitGuard } from '../common/rate-limit.guard';

class FeedbackDto {
  @IsIn(['message', 'flow', 'discovery'])
  target_type!: 'message' | 'flow' | 'discovery';

  @IsString()
  @MaxLength(80)
  target_id!: string;

  @IsIn(['helpful', 'not_helpful'])
  rating!: 'helpful' | 'not_helpful';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  reason_code?: string;
}

/**
 * Unified feedback (WF05/WF10/WF11). No free text in v1: the reason code is a
 * closed vocabulary, so nothing a visitor types can leak into analytics.
 */
@Controller('api/public/chat/v1/feedback')
@PublicEndpoint()
@UseGuards(OriginCsrfGuard, RateLimitGuard)
export class FeedbackController {
  private readonly events: Array<Record<string, unknown>> = [];

  @Post()
  create(@Body() body: FeedbackDto) {
    const event = {
      target_type: body.target_type,
      target_id: body.target_id,
      rating: body.rating,
      ...(body.reason_code ? { reason_code: body.reason_code } : {}),
      recorded_at: new Date().toISOString(),
    };
    this.events.push(event);
    return { accepted: true };
  }
}
