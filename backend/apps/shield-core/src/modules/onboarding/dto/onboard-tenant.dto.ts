import { Type } from 'class-transformer';
import {
  IsIn,
  IsDefined,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';
import type { EnvironmentType } from '../../environment/environment.entity';

const ENVIRONMENT_TYPES: EnvironmentType[] = [
  'PRODUCTION',
  'STAGING',
  'DEVELOPMENT',
  'TEST',
  'SIMULATION',
];
export const DATA_REGIONS = [
  'us-east-1',
  'us-west-2',
  'eu-west-1',
  'eu-central-1',
  'ap-south-1',
] as const;
export const DATA_CLASSES = [
  'PUBLIC',
  'INTERNAL',
  'CONFIDENTIAL',
  'RESTRICTED',
] as const;

export class OnboardLegalEntityDto {
  @IsString()
  @IsNotEmpty()
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
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsIn(ENVIRONMENT_TYPES)
  environmentType?: EnvironmentType;
}

export class OnboardTenantDto {
  // The approved, provisioned CommercialOrder this tenant is being created
  // for (spec §7.2: PROVISIONING requires "Approved order/entitlement" as
  // evidence). One order can back exactly one tenant.
  @IsUUID()
  orderId: string;

  @IsString()
  @IsNotEmpty()
  tenantName: string;

  // Lowercase, hyphenated, URL-safe — matches the Tenant.slug unique column.
  @Matches(/^[a-z0-9-]+$/, {
    message: 'tenantSlug must be lowercase letters, digits and hyphens only',
  })
  tenantSlug: string;

  @IsIn(DATA_REGIONS)
  homeRegion: string;

  @IsOptional()
  @IsIn(DATA_REGIONS)
  dataResidencyRegion?: string;

  @IsString()
  @Matches(/^[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/, {
    message: 'timezone must be an IANA timezone identifier',
  })
  timezone: string;

  @IsIn(DATA_CLASSES)
  dataClass: string;

  @IsString()
  @Matches(/^[a-z0-9][a-z0-9._:-]{1,127}$/i)
  retentionPolicyRef: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => OnboardLegalEntityDto)
  legalEntity: OnboardLegalEntityDto;

  @IsString()
  @IsNotEmpty()
  ownerEmail: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => OnboardEnvironmentDto)
  environment?: OnboardEnvironmentDto;

  // Must match the currently active ACCESS_DISCLOSURE PolicyDocument version.
  @IsString()
  accessDisclosureVersion: string;
}
