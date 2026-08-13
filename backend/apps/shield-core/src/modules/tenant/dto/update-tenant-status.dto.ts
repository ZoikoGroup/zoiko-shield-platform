import { IsIn } from 'class-validator';
import type { TenantStatus } from '../tenant.entity';

const STATUSES: TenantStatus[] = [
  'PROVISIONING',
  'ACTIVE',
  'RESTRICTED',
  'SUSPENDED',
  'OFFBOARDING',
  'CLOSED',
];

export class UpdateTenantStatusDto {
  @IsIn(STATUSES)
  status: TenantStatus;
}
