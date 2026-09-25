import type { WebauthnChallenge as WebauthnChallengeRow } from '@prisma/client';

export type WebauthnChallengePurpose =
  'REGISTRATION' | 'AUTHENTICATION' | 'STEP_UP';

/**
 * Challenges are persisted rather than held in memory so a replay cannot be
 * retried against a second instance, and so consumption is atomic across the
 * fleet. Single-use and short-lived by construction. `principalId` is null for
 * a usernameless authentication ceremony; `challenge` is base64url, as it
 * appears in clientDataJSON.challenge.
 */
export type WebauthnChallenge = Omit<WebauthnChallengeRow, 'purpose'> & {
  purpose: WebauthnChallengePurpose;
};
