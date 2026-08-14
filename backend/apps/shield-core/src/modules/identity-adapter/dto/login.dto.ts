import { IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsUUID()
  tenantId: string;

  @IsOptional()
  @IsUUID()
  environmentId?: string;
}
