import type { IdentityEvent as IdentityEventRow } from '@prisma/client';

/** Row of identity.identity_events, persisted through Prisma. */
export type IdentityEvent = Omit<IdentityEventRow, 'data'> & {
  data: Record<string, unknown>;
};
