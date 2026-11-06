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
  type VerifiableCredentialClaim,
  type W3CVerifiableCredential,
} from './verifiable-credential.service';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { PublicEndpoint } from '../../security/endpoint-access.decorator';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

// The global ValidationPipe runs with whitelist: true, which strips every
// property that carries no class-validator decorator.
export class VerifiableCredentialClaimDto implements VerifiableCredentialClaim {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  operatorId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  tenantId!: string;

  @IsIn([
    'SECOPS_PRIVILEGED_OPERATOR',
    'SECURITY_ENGINEER',
    'COMPLIANCE_AUDITOR',
  ])
  role!: VerifiableCredentialClaim['role'];

  @IsIn(['TIER_1_CRITICAL', 'TIER_2_ELEVATED', 'TIER_3_READONLY'])
  clearanceLevel!: VerifiableCredentialClaim['clearanceLevel'];

  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(256, { each: true })
  grantedScopes!: string[];
}

export class IssueVerifiableCredentialDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  subjectDid!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => VerifiableCredentialClaimDto)
  claims!: VerifiableCredentialClaim;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsPositive()
  validityDurationHours?: number;
}

export class VerifyVerifiableCredentialDto {
  // Deliberately not a nested DTO: the proof signs JSON.stringify of the
  // credential, so it must reach the verifier exactly as presented. Turning
  // it into a class instance would reorder or strip keys and break (or
  // launder) the signature check. The service itself rejects bad proofs.
  @IsObject()
  credential!: W3CVerifiableCredential;
}

@Controller('api/v1/identity/verifiable-credentials')
export class VerifiableCredentialController {
  constructor(private readonly vcService: VerifiableCredentialService) {}

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
