import { IsString, IsEmail, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  fullName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(12)
  password: string;

  @IsString()
  confirmPassword: string;

  @IsString()
  termsOfServiceVersion: string;
}
