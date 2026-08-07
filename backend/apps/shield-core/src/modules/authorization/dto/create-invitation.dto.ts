import { IsEmail, IsUUID } from 'class-validator';

export class CreateInvitationDto {
  @IsEmail()
  invitedEmail: string;

  @IsUUID()
  roleId: string;
}
