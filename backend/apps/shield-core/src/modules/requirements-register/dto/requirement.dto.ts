import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type {
  TenantScope,
  DataScope,
  AuthorityType,
  FailureBehavior,
  AiStatus,
  VerificationMethod,
  RequirementLifecycleStatus,
} from '../entities/requirement.entity';

// The global ValidationPipe runs with whitelist: true, which strips every
// property that carries no class-validator decorator. Each list below is
// keyed by its union so a value added to the entity type is a compile error
// here until it is accepted. The §08 quality rules (ID format, criteria
// length, ...) stay in RequirementsQualityGuard.
const TENANT_SCOPES = Object.keys({
  SINGLE_TENANT: true,
  MULTI_TENANT: true,
  SOVEREIGN_CELL: true,
  GLOBAL_SYSTEM: true,
} satisfies Record<TenantScope, true>);

const DATA_SCOPES = Object.keys({
  PUBLIC: true,
  INTERNAL_COMMERCIAL: true,
  CONFIDENTIAL_CUSTOMER_TELEMETRY: true,
  RESTRICTED_PHI_PII: true,
  LEGAL_PRIVILEGED_EVIDENCE: true,
  CRYPTOGRAPHIC_KEY_MATERIAL: true,
} satisfies Record<DataScope, true>);

const AUTHORITY_TYPES = Object.keys({
  LAW_REGULATION: true,
  CONTROLLED_SPEC: true,
  ADR: true,
  COMMERCIAL_CONTRACT: true,
  SECURITY_STANDARD: true,
} satisfies Record<AuthorityType, true>);

const FAILURE_BEHAVIORS = Object.keys({
  FAIL_CLOSED: true,
  DEGRADE_DETERMINISTIC: true,
  ALERT_AND_CONTINUE: true,
  CIRCUIT_BREAKER_OPEN: true,
} satisfies Record<FailureBehavior, true>);

const AI_STATUSES = Object.keys({
  DETERMINISTIC_ONLY: true,
  AI_ASSISTED_REVIEWED: true,
  HUMAN_IN_THE_LOOP: true,
} satisfies Record<AiStatus, true>);

const VERIFICATION_METHODS = Object.keys({
  AUTOMATED_UNIT_TEST: true,
  AUTOMATED_E2E_SPINE: true,
  CRYPTOGRAPHIC_VERIFIER_CLI: true,
  STATIC_ANALYSIS_LINTER: true,
  MULTI_APPROVER_GATE_SIGN: true,
} satisfies Record<VerificationMethod, true>);

const LIFECYCLE_STATUSES = Object.keys({
  DRAFT: true,
  ACTIVE_COMMITTED: true,
  VERIFIED_RELEASED: true,
  DEPRECATED: true,
  REJECTED: true,
} satisfies Record<RequirementLifecycleStatus, true>);

export class RequirementAuthorityDto {
  @IsIn(AUTHORITY_TYPES)
  type!: AuthorityType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  reference!: string;
}

export class RequirementEvidenceObligationDto {
  @IsBoolean()
  requiresMerkleProof!: boolean;

  @IsBoolean()
  requiresWitnessSeal!: boolean;

  @IsBoolean()
  requiresPostQuantumSignature!: boolean;
}

export class RequirementTraceabilityDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  implementingModule!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  sourceFilePath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  testFilePath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  evidenceGateId?: string;
}

export class CreateRequirementDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  version!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  statement!: string;

  @IsIn(TENANT_SCOPES)
  tenantScope!: TenantScope;

  @IsIn(DATA_SCOPES)
  dataScope!: DataScope;

  @IsDefined()
  @ValidateNested()
  @Type(() => RequirementAuthorityDto)
  authority!: {
    type: AuthorityType;
    reference: string;
  };

  @IsIn(FAILURE_BEHAVIORS)
  failureBehavior!: FailureBehavior;

  @IsIn(AI_STATUSES)
  aiStatus!: AiStatus;

  @IsDefined()
  @ValidateNested()
  @Type(() => RequirementEvidenceObligationDto)
  evidenceObligation!: {
    requiresMerkleProof: boolean;
    requiresWitnessSeal: boolean;
    requiresPostQuantumSignature: boolean;
  };

  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  acceptanceCriteria!: string[];

  @IsIn(VERIFICATION_METHODS)
  verificationMethod!: VerificationMethod;

  @IsDefined()
  @ValidateNested()
  @Type(() => RequirementTraceabilityDto)
  traceability!: {
    implementingModule: string;
    sourceFilePath?: string;
    testFilePath?: string;
    evidenceGateId?: string;
  };

  @IsOptional()
  @IsIn(LIFECYCLE_STATUSES)
  status?: RequirementLifecycleStatus;
}

// Bound with @Query(): every value arrives as a string, and all of these are
// strings, so no type conversion is needed.
export class QueryRequirementsDto {
  @IsOptional()
  @IsIn(TENANT_SCOPES)
  tenantScope?: TenantScope;

  @IsOptional()
  @IsIn(DATA_SCOPES)
  dataScope?: DataScope;

  @IsOptional()
  @IsIn(AUTHORITY_TYPES)
  authorityType?: AuthorityType;

  @IsOptional()
  @IsIn(FAILURE_BEHAVIORS)
  failureBehavior?: FailureBehavior;

  @IsOptional()
  @IsIn(LIFECYCLE_STATUSES)
  status?: RequirementLifecycleStatus;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  implementingModule?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  evidenceGateId?: string;
}
