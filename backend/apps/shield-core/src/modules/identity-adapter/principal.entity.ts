import type { Principal as PrincipalRow } from '@prisma/client';

export type PrincipalType =
  'HUMAN' | 'WORKLOAD' | 'CLIENT' | 'CONNECTOR' | 'AGENT';
export type PrincipalStatus = 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';

/** Row of identity.principals, persisted through Prisma. */
export type Principal = Omit<PrincipalRow, 'principalType' | 'status'> & {
  principalType: PrincipalType;
  status: PrincipalStatus;
};
