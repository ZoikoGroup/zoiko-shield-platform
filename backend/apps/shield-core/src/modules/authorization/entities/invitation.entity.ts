import type { Invitation as InvitationRow } from '@prisma/client';

export type InvitationStatus =
  'PENDING' | 'ACCEPTED' | 'CONSUMED' | 'EXPIRED' | 'REVOKED';
export type InvitationPurpose = 'TENANT_MEMBERSHIP' | 'OWNER_ACTIVATION';

/** Row of "authorization".invitations, persisted through Prisma. */
export type Invitation = Omit<InvitationRow, 'status' | 'purpose'> & {
  status: InvitationStatus;
  purpose: InvitationPurpose;
};
