import { IsIn, IsOptional, IsString } from 'class-validator';
import type { OrganizationStatus } from '../organization.entity';

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'DISABLED'])
  status?: OrganizationStatus;
}
