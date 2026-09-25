import type { FederationTransaction as FederationTransactionRow } from '@prisma/client';
import type { FederationProtocol } from './identity-provider-configuration.entity';

/**
 * Row of identity.federation_transactions, persisted through Prisma.
 *
 * `encryptedPayload` is an AES-256-GCM envelope containing nonce, PKCE
 * verifier, optional invitation and consent context, and return path. The key
 * is runtime-injected and not stored here.
 */
export type FederationTransaction = Omit<
  FederationTransactionRow,
  'protocol'
> & {
  protocol: FederationProtocol;
};
