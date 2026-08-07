import { Equals, IsEmail, IsString, MinLength } from 'class-validator';

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

  @Equals(true, { message: 'acceptTerms must be true' })
  acceptTerms: boolean;
}
