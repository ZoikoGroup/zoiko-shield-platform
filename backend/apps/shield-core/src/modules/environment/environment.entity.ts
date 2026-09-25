import type { Environment as EnvironmentRow } from '@prisma/client';

export type EnvironmentType =
  'PRODUCTION' | 'STAGING' | 'DEVELOPMENT' | 'TEST' | 'SIMULATION';
export type EnvironmentStatus = 'ACTIVE' | 'DISABLED';

/** Row of tenant.environments, persisted through Prisma. */
export type Environment = Omit<EnvironmentRow, 'environmentType' | 'status'> & {
  environmentType: EnvironmentType;
  status: EnvironmentStatus;
};
