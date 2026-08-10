import { IsArray, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import type { RoleLevel } from '../entities/role.entity';

export class CreateRoleDto {
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsEnum(['PLATFORM', 'TENANT'])
  roleLevel: RoleLevel;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionCodes?: string[];
}
