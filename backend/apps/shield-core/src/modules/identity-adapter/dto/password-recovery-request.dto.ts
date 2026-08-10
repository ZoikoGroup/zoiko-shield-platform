import { IsEmail } from 'class-validator';

export class PasswordRecoveryRequestDto {
  @IsEmail()
  email: string;
}
