import { IsString, MinLength } from 'class-validator';

export class PasswordRecoveryResetDto {
  @IsString()
  @MinLength(12)
  newPassword: string;

  @IsString()
  confirmNewPassword: string;
}
