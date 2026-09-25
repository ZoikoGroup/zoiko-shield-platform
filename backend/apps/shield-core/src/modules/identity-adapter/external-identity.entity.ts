import type { ExternalIdentity as ExternalIdentityRow } from '@prisma/client';

export type ExternalIdentityProvider = 'GOOGLE' | 'MICROSOFT' | 'OIDC' | 'SAML';

/** Row of identity.external_identities, persisted through Prisma. */
export type ExternalIdentity = Omit<
  ExternalIdentityRow,
  'provider' | 'claimProfile'
> & {
  provider: ExternalIdentityProvider;
  claimProfile: Record<string, unknown>;
};
