import type { Customer as CustomerRow } from '@prisma/client';

export type CustomerLifecycleStatus = 'ACTIVE' | 'SUSPENDED' | 'OFFBOARDED';
export type CustomerKycStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

/** Row of tenant.customers, persisted through Prisma. */
export type Customer = Omit<CustomerRow, 'lifecycleStatus' | 'kycStatus'> & {
  lifecycleStatus: CustomerLifecycleStatus;
  kycStatus: CustomerKycStatus;
};
