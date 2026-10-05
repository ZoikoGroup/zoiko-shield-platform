import {
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class StixObjectDto {
  @IsString()
  type!: string;

  @IsString()
  id!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  pattern?: string;

  @IsOptional()
  @IsString()
  pattern_type?: string;

  @IsOptional()
  @IsString()
  valid_from?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labels?: string[];

  @IsOptional()
  @IsNumber()
  confidence?: number;

  @IsOptional()
  @IsArray()
  external_references?: Array<{
    source_name: string;
    external_id?: string;
    url?: string;
  }>;
}

export class IngestStixBundleDto {
  @IsString()
  type!: 'bundle';

  @IsString()
  id!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StixObjectDto)
  objects!: StixObjectDto[];
}

export class MatchObservablesDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ipAddresses?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  domains?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fileHashes?: string[];
}

export class MpcBlindQueryItemDto {
  @IsString()
  blindedIndicatorHash!: string;

  @IsOptional()
  @IsString()
  metadataTag?: string;
}

export class MpcBlindEvaluateBatchDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MpcBlindQueryItemDto)
  items!: MpcBlindQueryItemDto[];
}
