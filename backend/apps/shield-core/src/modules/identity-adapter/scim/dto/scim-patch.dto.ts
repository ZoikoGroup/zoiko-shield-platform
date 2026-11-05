import { Type } from 'class-transformer';
import {
  Allow,
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export interface ScimPatchOperation {
  op: 'add' | 'remove' | 'replace';
  path?: string;
  value?: any;
}

/**
 * Runtime shape of ScimPatchOperation for the global ValidationPipe
 * (whitelist: true), which strips every property without a class-validator
 * decorator.
 */
export class ScimPatchOperationDto implements ScimPatchOperation {
  // RFC 7644 §3.5.2: op values are case-insensitive (Entra ID sends
  // "Replace"); ScimService lower-cases before comparing.
  @IsString()
  @Matches(/^(add|remove|replace)$/i)
  op!: 'add' | 'remove' | 'replace';

  @IsOptional()
  @IsString()
  @MaxLength(512)
  path?: string;

  // RFC 7644 lets value be any JSON type (scalar, object, array) depending
  // on op and path, so its shape is genuinely open.
  @Allow()
  value?: any;
}

export class ScimPatchDto {
  @IsArray()
  @IsString({ each: true })
  schemas!: string[];

  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ScimPatchOperationDto)
  Operations!: ScimPatchOperation[];
}
