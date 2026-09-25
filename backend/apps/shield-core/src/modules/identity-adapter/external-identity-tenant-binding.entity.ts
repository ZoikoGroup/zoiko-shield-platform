import type { ExternalIdentityTenantBinding as ExternalIdentityTenantBindingRow } from '@prisma/client';

export type ExternalIdentityTenantBindingStatus = 'ACTIVE' | 'SUSPENDED';

/** Row of identity.external_identity_tenant_bindings, persisted through Prisma. */
export type ExternalIdentityTenantBinding = Omit<
  ExternalIdentityTenantBindingRow,
  'status'
> & {
  status: ExternalIdentityTenantBindingStatus;
};
