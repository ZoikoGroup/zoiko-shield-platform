import { Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { HumanAuthorityAttestationDto } from '../../human-authority/human-authority.dto';

export const DELETION_REQUEST_AUTHORITIES = [
  'DATA_SUBJECT',
  'AUTHORIZED_REPRESENTATIVE',
  'TENANT_CONTROLLER',
] as const;

export class CreateDeletionRequestDto {
  @IsString()
  @MinLength(3)
  subjectReference!: string;

  @IsIn(DELETION_REQUEST_AUTHORITIES)
  requestAuthority!: (typeof DELETION_REQUEST_AUTHORITIES)[number];

  @IsString()
  @MinLength(10)
  reason!: string;

  @IsObject()
  scope!: Record<string, unknown>;

  @IsOptional()
  @IsISO8601()
  statutoryDeadlineAt?: string;
}

export class CreateLegalHoldDto {
  @IsObject()
  scope!: Record<string, unknown>;

  @IsString()
  @MinLength(3)
  authority!: string;

  @IsString()
  @MinLength(10)
  reason!: string;

  @IsISO8601()
  reviewAt!: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => HumanAuthorityAttestationDto)
  humanAuthority!: HumanAuthorityAttestationDto;
}

export class ApproveDeletionDto {
  @IsString()
  runId!: string;

  @IsString()
  @MinLength(10)
  decisionReason!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => HumanAuthorityAttestationDto)
  humanAuthority!: HumanAuthorityAttestationDto;
}

export class OffboardingReasonDto {
  @IsString()
  @MinLength(10)
  reason!: string;
}

export class OffboardingRunDto {
  @IsString()
  runId!: string;
}
