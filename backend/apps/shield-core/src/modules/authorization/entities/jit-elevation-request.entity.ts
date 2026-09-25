import type { JitElevationRequest as JitElevationRequestRow } from '@prisma/client';

export type JitElevationStatus =
  'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'REVOKED';

/** Row of "authorization".jit_elevation_requests, persisted through Prisma. */
export type JitElevationRequest = Omit<JitElevationRequestRow, 'status'> & {
  status: JitElevationStatus;
};
