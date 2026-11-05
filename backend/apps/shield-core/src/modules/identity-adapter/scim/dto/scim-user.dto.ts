import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

// The global ValidationPipe runs with whitelist: true, which strips every
// property that carries no class-validator decorator.
export class ScimUserNameDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  formatted?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  familyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  givenName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  middleName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  honorificPrefix?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  honorificSuffix?: string;
}

export class ScimEmailDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(320)
  value!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  type?: string;

  @IsOptional()
  @IsBoolean()
  primary?: boolean;
}

export class CreateScimUserDto {
  @IsArray()
  @IsString({ each: true })
  schemas!: string[];

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  userName!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ScimUserNameDto)
  name?: ScimUserNameDto;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  nickName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  profileUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  userType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  preferredLanguage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  locale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ScimEmailDto)
  emails?: ScimEmailDto[];

  @IsOptional()
  @IsString()
  @MaxLength(256)
  externalId?: string;
}
