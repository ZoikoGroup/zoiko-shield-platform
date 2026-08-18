import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class StartSsoDto {
  @IsString()
  @MaxLength(120)
  tenantSlug: string;

  @IsUUID()
  identityProviderId: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  invitationToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  @Matches(/^\/(?!\/)/, {
    message: 'returnTo must be an application-relative path',
  })
  returnTo?: string;
}
