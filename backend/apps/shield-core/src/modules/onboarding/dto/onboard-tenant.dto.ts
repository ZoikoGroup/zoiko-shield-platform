import { Type } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import type { EnvironmentType } from '../../environment/environment.entity';

const ENVIRONMENT_TYPES: EnvironmentType[] = ['PRODUCTION', 'STAGING', 'DEVELOPMENT', 'TEST', 'SIMULATION'];

export class OnboardLegalEntityDto {
  @IsString()
  legalName: string;

  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  countryOfRegistration?: string;

  @IsOptional()
  @IsString()
  registeredAddress?: string;
}

export class OnboardEnvironmentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(ENVIRONMENT_TYPES)
  environmentType?: EnvironmentType;
}

export class OnboardTenantDto {
  @IsString()
  tenantName: string;

  // Lowercase, hyphenated, URL-safe — matches the Tenant.slug unique column.
  @Matches(/^[a-z0-9-]+$/, { message: 'tenantSlug must be lowercase letters, digits and hyphens only' })
  tenantSlug: string;

  @IsString()
  homeRegion: string;

  @IsOptional()
  @IsString()
  dataResidencyRegion?: string;

  @IsString()
  timezone: string;

  @IsString()
  dataClass: string;

  @IsString()
  retentionPolicyRef: string;

  @ValidateNested()
  @Type(() => OnboardLegalEntityDto)
  legalEntity: OnboardLegalEntityDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => OnboardEnvironmentDto)
  environment?: OnboardEnvironmentDto;

  // Must match the currently active ACCESS_DISCLOSURE PolicyDocument version.
  @IsString()
  accessDisclosureVersion: string;
}
