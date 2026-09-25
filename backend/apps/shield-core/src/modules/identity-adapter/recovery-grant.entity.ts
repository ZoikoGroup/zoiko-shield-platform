import type { RecoveryGrant as RecoveryGrantRow } from '@prisma/client';

/**
 * Short-lived, single-use, single-purpose proof that a password-recovery OTP
 * was verified. Deliberately separate from Session — it must never satisfy
 * a normal access_token/JwtAuthGuard check or carry tenant authority.
 */
export type RecoveryGrant = RecoveryGrantRow;
