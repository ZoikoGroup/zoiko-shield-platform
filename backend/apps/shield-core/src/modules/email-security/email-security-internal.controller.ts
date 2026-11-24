import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InternalAuthGuard } from '../../internal-client/internal-auth.guard';
import { EmailSecurityService } from './email-security.service';
import { InternalMailEventDto } from './dto/email-security.dto';

/**
 * shield-ingest -> shield-core hand-off for Zoiko Mail security events
 * (ZS-UX-EMTI-001 EW06). Ingest has already verified the envelope signature,
 * registry, freshness, payload hash and replay receipt. No tenant header is
 * trusted here: the tenant is resolved from the opaque server-issued binding.
 */
@Controller('internal/v1/email')
@UseGuards(InternalAuthGuard)
export class EmailSecurityInternalController {
  constructor(private readonly emailService: EmailSecurityService) {}

  @Post('mail-events')
  @HttpCode(HttpStatus.OK)
  async ingestMailEvent(@Body() dto: InternalMailEventDto) {
    const data = await this.emailService.ingestMailEvent(dto);
    return { statusCode: HttpStatus.OK, data };
  }
}
