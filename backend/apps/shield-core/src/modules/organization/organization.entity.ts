import type { Organization as OrganizationRow } from '@prisma/client';

export type OrganizationStatus = 'ACTIVE' | 'DISABLED';

/** Row of tenant.organizations, persisted through Prisma. */
export type Organization = Omit<OrganizationRow, 'status'> & {
  status: OrganizationStatus;
};
