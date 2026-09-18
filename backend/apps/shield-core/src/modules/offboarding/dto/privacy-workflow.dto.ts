import { Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Min,
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

export const RETENTION_BASES = [
  'CONTRACTUAL',
  'STATUTORY',
  'PLATFORM_DEFAULT',
] as const;

export class RecordRetentionPolicyDto {
  @IsIn(RETENTION_BASES)
  basis!: (typeof RETENTION_BASES)[number];

  /** The contract, regulation or standard that sets this period. */
  @IsString()
  @MinLength(3)
  authority!: string;

  @IsInt()
  @Min(0)
  periodDays!: number;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;

  @IsOptional()
  @IsISO8601()
  effectiveTo?: string;
}
