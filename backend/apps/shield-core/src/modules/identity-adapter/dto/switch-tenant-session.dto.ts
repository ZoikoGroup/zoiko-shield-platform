import { IsOptional, IsUUID } from 'class-validator';

export class SwitchTenantSessionDto {
  @IsUUID()
  tenantId: string;

  @IsOptional()
  @IsUUID()
  environmentId?: string;
}
