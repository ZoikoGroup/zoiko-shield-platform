import { IsArray, IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class RegisterDto {
  @IsUUID()
  tenantId: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(12)
  password: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];
}
