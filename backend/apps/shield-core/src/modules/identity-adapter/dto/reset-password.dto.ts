import { IsEmail, IsString, Length, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsEmail()
  email: string;

  @Length(6, 6)
  otp: string;

  @IsString()
  @MinLength(12)
  newPassword: string;

  @IsString()
  confirmNewPassword: string;
}
