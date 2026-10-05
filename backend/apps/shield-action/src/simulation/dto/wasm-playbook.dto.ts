import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum PlaybookExecutionTier {
  TIER_0_CRITICAL = 'TIER_0_CRITICAL',
  TIER_1_STANDARD = 'TIER_1_STANDARD',
  TIER_2_DEV = 'TIER_2_DEV',
}

export enum WasmSandboxMutationType {
  AWS_IAM_ATTACH_POLICY = 'AWS_IAM_ATTACH_POLICY',
  AWS_IAM_DETACH_POLICY = 'AWS_IAM_DETACH_POLICY',
  AWS_EC2_ISOLATE_SECURITY_GROUP = 'AWS_EC2_ISOLATE_SECURITY_GROUP',
  K8S_DRAIN_NODE = 'K8S_DRAIN_NODE',
  K8S_QUARANTINE_NAMESPACE = 'K8S_QUARANTINE_NAMESPACE',
  OKTA_REVOKE_USER_SESSIONS = 'OKTA_REVOKE_USER_SESSIONS',
  CROWDSTRIKE_CONTAIN_HOST = 'CROWDSTRIKE_CONTAIN_HOST',
  AZURE_NSG_BLOCK_PORT = 'AZURE_NSG_BLOCK_PORT',
}

export class WasmPlaybookStepDto {
  @IsString()
  @IsNotEmpty()
  stepId: string;

  @IsEnum(WasmSandboxMutationType)
  actionType: WasmSandboxMutationType;

  @IsString()
  @IsNotEmpty()
  targetResourceArn: string;

  @IsObject()
  @IsOptional()
  parameters?: Record<string, any>;

  @IsNumber()
  @Min(0)
  @Max(1000)
  @IsOptional()
  timeoutMs?: number;
}

export class TargetAssetSnapshotDto {
  @IsString()
  @IsNotEmpty()
  assetId: string;

  @IsEnum(PlaybookExecutionTier)
  criticalityTier: PlaybookExecutionTier;

  @IsString()
  @IsNotEmpty()
  cloudProvider: 'AWS' | 'AZURE' | 'GCP' | 'KUBERNETES' | 'OKTA';

  @IsObject()
  preExecutionState: Record<string, any>;
}

export class SimulateWasmPlaybookDto {
  @IsString()
  @IsNotEmpty()
  tenantId: string;

  @IsString()
  @IsNotEmpty()
  playbookId: string;

  @IsString()
  @IsNotEmpty()
  playbookVersion: string;

  @IsString()
  @IsNotEmpty()
  incidentId: string;

  @IsString()
  @IsNotEmpty()
  wasmBytecodeBase64: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WasmPlaybookStepDto)
  steps: WasmPlaybookStepDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TargetAssetSnapshotDto)
  targetAssets: TargetAssetSnapshotDto[];

  @IsNumber()
  @Min(10)
  @Max(2000)
  @IsOptional()
  maxMemoryMb?: number;

  @IsNumber()
  @Min(10)
  @Max(5000)
  @IsOptional()
  maxCpuTimeoutMs?: number;
}

export class SynthesizeRollbackDto {
  @IsString()
  @IsNotEmpty()
  tenantId: string;

  @IsString()
  @IsNotEmpty()
  playbookId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WasmPlaybookStepDto)
  executedSteps: WasmPlaybookStepDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TargetAssetSnapshotDto)
  originalAssetStates: TargetAssetSnapshotDto[];
}
