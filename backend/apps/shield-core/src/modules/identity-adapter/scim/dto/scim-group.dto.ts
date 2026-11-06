import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

// The global ValidationPipe runs with whitelist: true, which strips every
// property that carries no class-validator decorator.
export class ScimGroupMemberDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  value!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  $ref?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  display?: string;

  @IsOptional()
  @IsIn(['User', 'Group'])
  type?: 'User' | 'Group';
}

export class CreateScimGroupDto {
  @IsArray()
  @IsString({ each: true })
  schemas!: string[];

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  displayName!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10000)
  @ValidateNested({ each: true })
  @Type(() => ScimGroupMemberDto)
  members?: ScimGroupMemberDto[];

  @IsOptional()
  @IsString()
  @MaxLength(256)
  externalId?: string;
}
