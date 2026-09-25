import type { IdentityProviderConfiguration as IdentityProviderConfigurationRow } from '@prisma/client';

export type FederationProtocol = 'OIDC' | 'SAML';
export type IdentityProviderStatus = 'DRAFT' | 'ACTIVE' | 'DISABLED';
export type OidcClientAuthMethod = 'client_secret_basic' | 'client_secret_post';

export interface PinnedOidcMetadata extends Record<string, unknown> {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
  scopes_supported?: string[];
  claims_supported?: string[];
  code_challenge_methods_supported?: string[];
  id_token_signing_alg_values_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  response_types_supported?: string[];
}

/**
 * Row of identity.identity_provider_configurations, persisted through Prisma.
 *
 * `clientSecretRef` and `samlSpPrivateKeyRef` are references into the runtime
 * secret provider. Secret material is never persisted in this configuration
 * table or returned by the API.
 */
export type IdentityProviderConfiguration = Omit<
  IdentityProviderConfigurationRow,
  | 'protocol'
  | 'status'
  | 'oidcClientAuthMethod'
  | 'oidcMetadata'
  | 'samlIdpCertificates'
  | 'mfaClaimValues'
> & {
  protocol: FederationProtocol;
  status: IdentityProviderStatus;
  oidcClientAuthMethod: OidcClientAuthMethod | null;
  oidcMetadata: PinnedOidcMetadata | null;
  samlIdpCertificates: string[];
  mfaClaimValues: string[];
};
