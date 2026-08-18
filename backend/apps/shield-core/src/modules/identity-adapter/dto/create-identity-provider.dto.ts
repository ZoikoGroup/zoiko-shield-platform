import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import type {
  FederationProtocol,
  OidcClientAuthMethod,
} from '../identity-provider-configuration.entity';

export class CreateIdentityProviderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;

  @IsEnum(['OIDC', 'SAML'])
  protocol: FederationProtocol;

  @IsUUID()
  environmentId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  issuer: string;

  @ValidateIf((dto: CreateIdentityProviderDto) => dto.protocol === 'OIDC')
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  clientId?: string;

  @ValidateIf((dto: CreateIdentityProviderDto) => dto.protocol === 'OIDC')
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  clientSecretRef?: string;

  @IsOptional()
  @IsEnum(['client_secret_basic', 'client_secret_post'])
  oidcClientAuthMethod?: OidcClientAuthMethod;

  @ValidateIf((dto: CreateIdentityProviderDto) => dto.protocol === 'SAML')
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  samlEntryPoint?: string;

  @ValidateIf((dto: CreateIdentityProviderDto) => dto.protocol === 'SAML')
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  samlIdpCertificates?: string[];

  @ValidateIf((dto: CreateIdentityProviderDto) => dto.protocol === 'SAML')
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  samlSpEntityId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  samlSpPrivateKeyRef?: string;

  @IsOptional()
  @IsString()
  samlSpPublicCertificate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  emailClaim?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  displayNameClaim?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  groupsClaim?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  mfaClaimValues?: string[];

  @IsOptional()
  @IsBoolean()
  requireMfa?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(300000)
  allowedClockSkewMs?: number;
}
