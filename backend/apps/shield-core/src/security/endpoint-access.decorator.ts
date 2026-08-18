import { SetMetadata } from '@nestjs/common';

export const ENDPOINT_ACCESS_KEY = 'shield:endpoint-access';

export type EndpointAccessPolicy =
  'PUBLIC' | 'EXTERNAL_AUTHENTICATED' | 'AUTHENTICATION_ONLY';

/**
 * Declares that an endpoint intentionally accepts callers without a
 * ZoikoShield session. This is limited to health/authentication ingress and
 * must never be used for tenant resources.
 */
export const PublicEndpoint = () =>
  SetMetadata(ENDPOINT_ACCESS_KEY, 'PUBLIC' satisfies EndpointAccessPolicy);

/**
 * Declares ingress authenticated by a protocol-specific verifier in the
 * owning service (for example, a payment-provider webhook signature).
 */
export const ExternallyAuthenticatedEndpoint = () =>
  SetMetadata(
    ENDPOINT_ACCESS_KEY,
    'EXTERNAL_AUTHENTICATED' satisfies EndpointAccessPolicy,
  );

/**
 * Marks a route that intentionally requires identity proof but no tenant
 * resource authority, such as session inspection or invitation acceptance.
 * An authentication guard is still mandatory.
 */
export const AuthenticationOnlyEndpoint = () =>
  SetMetadata(
    ENDPOINT_ACCESS_KEY,
    'AUTHENTICATION_ONLY' satisfies EndpointAccessPolicy,
  );
