import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['active', 'suspended', 'offboarded'])
  status?: 'active' | 'suspended' | 'offboarded';
}
