import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export type PolicyDomain =
  | 'IAM'
  | 'DETECTION'
  | 'RESPONSE'
  | 'RESIDENCY'
  | 'RATE_LIMIT';

export type PolicyLifecycleStatus =
  | 'ACTIVE'
  | 'PENDING_APPROVAL'
  | 'STAGED'
  | 'ROLLED_BACK';

export class StagePolicyDto {
  @IsString()
  @IsNotEmpty()
  stagedEnvironment!: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  canaryPercentage!: number;
}

export class ApprovePolicyDto {
  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  reason?: string;
}

export class RollbackPolicyDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
