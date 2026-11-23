import { Body, Controller, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { InternalAuthGuard } from '../internal-client/internal-auth.guard';
import {
  EmailEvidenceService,
  type AnchorEmailManifestInput,
  type VerifyEmailManifestInput,
} from './email-evidence.service';

@Controller('internal/v1/email-evidence')
@UseGuards(InternalAuthGuard)
export class EmailEvidenceController {
  constructor(private readonly emailEvidenceService: EmailEvidenceService) {}

  @Post('manifests/anchor')
  anchor(@Body() body: AnchorEmailManifestInput) {
    return {
      statusCode: HttpStatus.OK,
      data: this.emailEvidenceService.anchorManifest(body),
    };
  }

  @Post('manifests/verify')
  verify(@Body() body: VerifyEmailManifestInput) {
    return {
      statusCode: HttpStatus.OK,
      data: this.emailEvidenceService.verifyManifest(body),
    };
  }
}
