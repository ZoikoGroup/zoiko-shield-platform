import {
  Equals,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class StartOwnerActivationDto {
  @IsUUID()
  identityProviderId: string;

  @IsString()
  @MaxLength(120)
  accessDisclosureVersion: string;

  @IsBoolean()
  @Equals(true, { message: 'accessDisclosureAccepted must be true' })
  accessDisclosureAccepted: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  @Matches(/^\/(?!\/)/, {
    message: 'returnTo must be an application-relative path',
  })
  returnTo?: string;
}
