import { IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateInvitationDto {
  @IsEmail()
  invitedEmail: string;

  @IsOptional()
  @IsUUID()
  roleId?: string;

  @IsOptional()
  @IsString()
  assignedRole?: string;
}
