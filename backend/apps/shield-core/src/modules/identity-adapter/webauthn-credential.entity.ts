import type { WebauthnCredential as WebauthnCredentialRow } from '@prisma/client';

/**
 * A registered WebAuthn/FIDO2 passkey. The stored public key is the SPKI the
 * authenticator produced at registration; the private key never leaves the
 * authenticator, so a stolen database row cannot be replayed as a login.
 *
 * `credentialId` is the base64url credential id as returned by the
 * authenticator. `signCount` drives cloned-authenticator detection; it is a
 * BIGINT column, which Prisma returns as a bigint, so it must never be
 * serialized directly. Authenticators that do not implement a counter report
 * 0 forever, which is why a 0 count never trips the check.
 */
export type WebauthnCredential = WebauthnCredentialRow;
