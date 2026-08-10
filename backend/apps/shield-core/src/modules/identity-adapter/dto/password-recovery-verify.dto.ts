import { IsEmail, Length } from 'class-validator';

export class PasswordRecoveryVerifyDto {
  @IsEmail()
  email: string;

  @Length(6, 6)
  otp: string;
}
