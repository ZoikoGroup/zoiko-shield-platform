import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ScanCloudAssetDto {
  @IsString()
  assetId!: string;

  @IsString()
  assetType!:
    'S3_BUCKET' | 'GCS_BUCKET' | 'IAM_POLICY' | 'K8S_POD' | 'COMPUTE_INSTANCE';

  @IsString()
  cloudProvider!: 'AWS' | 'AZURE' | 'GCP' | 'KUBERNETES';

  @IsObject()
  configuration!: Record<string, any>;
}

export class ScanTenantPostureDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScanCloudAssetDto)
  assets?: ScanCloudAssetDto[];
}

export class RemediatePostureDriftDto {
  @IsString()
  @IsNotEmpty()
  findingId!: string;

  @IsString()
  @IsNotEmpty()
  operatorRationale!: string;

  @IsOptional()
  @IsString()
  dualCustodyApproverId?: string;
}
