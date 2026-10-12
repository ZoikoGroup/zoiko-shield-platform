import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  VerifiableCredentialService,
  VerifiableCredentialClaim,
  W3CVerifiableCredential,
} from './verifiable-credential.service';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { PublicEndpoint } from '../../security/endpoint-access.decorator';

export class IssueVerifiableCredentialDto {
  subjectDid!: string;
  claims!: VerifiableCredentialClaim;
  validityDurationHours?: number;
}

export class VerifyVerifiableCredentialDto {
  credential!: W3CVerifiableCredential;
}

@Controller('api/v1/identity/verifiable-credentials')
export class VerifiableCredentialController {
  constructor(
    private readonly vcService: VerifiableCredentialService,
  ) {}

  @PublicEndpoint()
  @Get('issuer')
  getIssuerMetadata() {
    return {
      issuerDid: this.vcService.getIssuerDid(),
      keyType: 'prime256v1',
      supportedProofTypes: ['JsonWebSignature2020'],
      standard: 'W3C Verifiable Credentials Data Model v1.1',
      status: 'ACTIVE',
      timestamp: new Date().toISOString(),
    };
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('identity:manage')
  @Post('issue')
  @HttpCode(HttpStatus.CREATED)
  issueCredential(@Body() dto: IssueVerifiableCredentialDto) {
    return this.vcService.issueVerifiableCredential({
      subjectDid: dto.subjectDid,
      claims: dto.claims,
      validityDurationHours: dto.validityDurationHours ?? 24,
    });
  }

  @PublicEndpoint()
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  verifyCredential(@Body() dto: VerifyVerifiableCredentialDto) {
    return this.vcService.verifyVerifiableCredential(dto.credential);
  }
}
