import type { Tenant as TenantRow } from '@prisma/client';

// §7.2 Tenant lifecycle. A tenant is created in PROVISIONING and becomes
// ACTIVE only after the invited owner completes identity and policy checks.
export type TenantStatus =
  | 'PROVISIONING'
  | 'ACTIVE'
  | 'RESTRICTED'
  | 'SUSPENDED'
  | 'OFFBOARDING'
  | 'CLOSED';

/** Row of tenant.tenants, persisted through Prisma. */
export type Tenant = Omit<TenantRow, 'status'> & { status: TenantStatus };
