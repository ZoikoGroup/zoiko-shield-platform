import type { VerificationChallenge as VerificationChallengeRow } from '@prisma/client';

export type ChallengePurpose = 'PASSWORD_RECOVERY';
export type ChallengeStatus = 'PENDING' | 'CONSUMED' | 'EXPIRED' | 'LOCKED';

/** Row of identity.verification_challenges, persisted through Prisma. */
export type VerificationChallenge = Omit<
  VerificationChallengeRow,
  'purpose' | 'status'
> & {
  purpose: ChallengePurpose;
  status: ChallengeStatus;
};
