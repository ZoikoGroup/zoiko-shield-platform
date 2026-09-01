import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import type { CustomFetch } from 'openid-client';
import {
  IdentityProviderConfiguration,
  PinnedOidcMetadata,
} from './identity-provider-configuration.entity';
import { FederationRuntimeService } from './federation-runtime.service';
import { FederationAssertion } from './interfaces/federation-assertion.interface';

type OpenIdClientModule = typeof import('openid-client');

const APPROVED_ID_TOKEN_ALGORITHMS = ['PS256', 'RS256', 'ES256'] as const;

@Injectable()
export class OidcFederationService {
  constructor(private readonly runtime: FederationRuntimeService) {}

  async discoverAndPin(provider: IdentityProviderConfiguration): Promise<{
    metadata: PinnedOidcMetadata;
    signingAlgorithm: string;
    metadataHash: string;
  }> {
    this.assertConfigured(provider);
    const library = await this.library();
    const issuer = this.runtime.assertApprovedExternalUrl(
      provider.issuer,
      'issuer',
    );
    const secret = this.runtime.resolveSecret(provider.clientSecretRef);
    let configuration: InstanceType<OpenIdClientModule['Configuration']>;
    try {
      configuration = await library.discovery(
        issuer,
        provider.clientId!,
        { client_secret: secret },
        this.clientAuthentication(library, provider, secret),
        { [library.customFetch]: this.boundedFetch() },
      );
      configuration.timeout = 10;
    } catch {
      throw new ServiceUnavailableException(
        'FEDERATION_UNAVAILABLE: OIDC discovery could not be completed',
      );
    }
    const discovered = configuration.serverMetadata();
    if (discovered.issuer !== provider.issuer) {
      throw new BadRequestException(
        'OIDC discovery issuer does not match the configured issuer',
      );
    }
    const authorizationEndpoint = this.requireEndpoint(
      discovered.authorization_endpoint,
      'authorization_endpoint',
    );
    const tokenEndpoint = this.requireEndpoint(
      discovered.token_endpoint,
      'token_endpoint',
    );
    const jwksUri = this.requireEndpoint(discovered.jwks_uri, 'jwks_uri');
    const supportedAlgorithms =
      discovered.id_token_signing_alg_values_supported ?? [];
    const signingAlgorithm = APPROVED_ID_TOKEN_ALGORITHMS.find((algorithm) =>
      supportedAlgorithms.includes(algorithm),
    );
    if (!signingAlgorithm) {
      throw new BadRequestException(
        'OIDC provider does not advertise an approved asymmetric ID-token signing algorithm',
      );
    }
    if (!discovered.code_challenge_methods_supported?.includes('S256')) {
      throw new BadRequestException(
        'OIDC provider must advertise PKCE using the S256 challenge method',
      );
    }
    if (
      discovered.response_types_supported &&
      !discovered.response_types_supported.includes('code')
    ) {
      throw new BadRequestException(
        'OIDC provider does not support the authorization-code response type',
      );
    }
    const supportedClientAuthentication =
      discovered.token_endpoint_auth_methods_supported ?? [
        'client_secret_basic',
      ];
    if (
      !supportedClientAuthentication.includes(
        provider.oidcClientAuthMethod ?? 'client_secret_basic',
      )
    ) {
      throw new BadRequestException(
        'OIDC provider does not support the configured client authentication method',
      );
    }
    const metadata: PinnedOidcMetadata = {
      issuer: discovered.issuer,
      authorization_endpoint: authorizationEndpoint,
      token_endpoint: tokenEndpoint,
      jwks_uri: jwksUri,
      ...(discovered.end_session_endpoint
        ? {
            end_session_endpoint: this.requireEndpoint(
              discovered.end_session_endpoint,
              'end_session_endpoint',
            ),
          }
        : {}),
      scopes_supported: discovered.scopes_supported,
      claims_supported: discovered.claims_supported,
      code_challenge_methods_supported:
        discovered.code_challenge_methods_supported,
      id_token_signing_alg_values_supported: supportedAlgorithms,
      token_endpoint_auth_methods_supported: supportedClientAuthentication,
      response_types_supported: discovered.response_types_supported,
    };
    return {
      metadata,
      signingAlgorithm,
      metadataHash: createHash('sha256')
        .update(JSON.stringify(metadata))
        .digest('hex'),
    };
  }

  async buildAuthorizationUrl(input: {
    provider: IdentityProviderConfiguration;
    state: string;
    nonce: string;
    pkceCodeVerifier: string;
  }): Promise<string> {
    const library = await this.library();
    const configuration = this.configuration(library, input.provider);
    const codeChallenge = await library.calculatePKCECodeChallenge(
      input.pkceCodeVerifier,
    );
    return library
      .buildAuthorizationUrl(configuration, {
        redirect_uri: this.runtime.callbackUrl('OIDC'),
        response_type: 'code',
        scope: 'openid profile email',
        state: input.state,
        nonce: input.nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      })
      .toString();
  }

  async validateCallback(input: {
    provider: IdentityProviderConfiguration;
    state: string;
    code: string;
    nonce: string;
    pkceCodeVerifier: string;
  }): Promise<FederationAssertion> {
    const library = await this.library();
    const configuration = this.configuration(library, input.provider);
    const callbackUrl = new URL(this.runtime.callbackUrl('OIDC'));
    callbackUrl.searchParams.set('state', input.state);
    callbackUrl.searchParams.set('code', input.code);
    let tokens: Awaited<
      ReturnType<OpenIdClientModule['authorizationCodeGrant']>
    >;
    try {
      tokens = await library.authorizationCodeGrant(
        configuration,
        callbackUrl,
        {
          expectedState: input.state,
          expectedNonce: input.nonce,
          pkceCodeVerifier: input.pkceCodeVerifier,
          idTokenExpected: true,
        },
      );
    } catch (error) {
      if (this.isDependencyFailure(error)) {
        throw new ServiceUnavailableException(
          'FEDERATION_UNAVAILABLE: OIDC provider could not be reached',
        );
      }
      throw new UnauthorizedException(
        'FEDERATION_ASSERTION_REJECTED: OIDC response validation failed',
      );
    }
    const claims = tokens.claims();
    if (!claims || typeof claims.sub !== 'string') {
      throw new UnauthorizedException(
        'FEDERATION_ASSERTION_REJECTED: OIDC ID token has no subject',
      );
    }
    if (claims.iss !== input.provider.issuer) {
      throw new UnauthorizedException(
        'FEDERATION_ASSERTION_REJECTED: OIDC issuer mismatch',
      );
    }
    const email = this.stringClaim(claims, input.provider.emailClaim);
    if (!email) {
      throw new UnauthorizedException(
        'FEDERATION_ASSERTION_REJECTED: OIDC assertion has no configured email claim',
      );
    }
    if (claims.email_verified === false) {
      throw new UnauthorizedException(
        'FEDERATION_ASSERTION_REJECTED: OIDC email is not verified',
      );
    }
    const amr = Array.isArray(claims.amr)
      ? claims.amr.filter((value): value is string => typeof value === 'string')
      : [];
    const acceptedMfaValues = (
      input.provider.mfaClaimValues.length
        ? input.provider.mfaClaimValues
        : ['mfa', 'otp', 'hwk', 'fido', 'webauthn']
    ).map((value) => value.toLowerCase());
    const hasMfa = amr.some((value) =>
      acceptedMfaValues.includes(value.toLowerCase()),
    );
    if (input.provider.requireMfa && !hasMfa) {
      throw new UnauthorizedException(
        'STEP_UP_REQUIRED: The identity provider did not assert MFA',
      );
    }
    const fullName = this.stringClaim(claims, input.provider.displayNameClaim);
    const groups = input.provider.groupsClaim
      ? claims[input.provider.groupsClaim]
      : undefined;
    return {
      issuer: claims.iss,
      subject: claims.sub,
      email,
      fullName,
      assurance: hasMfa ? 'FEDERATED_MFA' : 'FEDERATED',
      claimProfile: {
        email,
        emailVerified: claims.email_verified === true,
        ...(fullName ? { name: fullName } : {}),
        amr,
        ...(typeof claims.acr === 'string' ? { acr: claims.acr } : {}),
        ...(Array.isArray(groups)
          ? {
              groups: groups.filter(
                (value): value is string => typeof value === 'string',
              ),
            }
          : {}),
      },
    };
  }

  private configuration(
    library: OpenIdClientModule,
    provider: IdentityProviderConfiguration,
  ): InstanceType<OpenIdClientModule['Configuration']> {
    this.assertConfigured(provider);
    if (
      !provider.oidcMetadata ||
      !provider.oidcSigningAlgorithm ||
      provider.status !== 'ACTIVE'
    ) {
      throw new ServiceUnavailableException(
        'FEDERATION_UNAVAILABLE: OIDC configuration is not active and pinned',
      );
    }
    const secret = this.runtime.resolveSecret(provider.clientSecretRef);
    const configuration = new library.Configuration(
      provider.oidcMetadata as unknown as import('openid-client').ServerMetadata,
      provider.clientId!,
      {
        client_secret: secret,
        id_token_signed_response_alg: provider.oidcSigningAlgorithm,
      },
      this.clientAuthentication(library, provider, secret),
    );
    configuration.timeout = 10;
    configuration[library.customFetch] = this.boundedFetch();
    return configuration;
  }

  private boundedFetch(): CustomFetch {
    return async (url, options) => {
      this.runtime.assertApprovedExternalUrl(url, 'OIDC endpoint');
      return fetch(url, options as unknown as RequestInit);
    };
  }

  private clientAuthentication(
    library: OpenIdClientModule,
    provider: IdentityProviderConfiguration,
    secret: string | undefined,
  ) {
    return provider.oidcClientAuthMethod === 'client_secret_basic'
      ? library.ClientSecretBasic(secret)
      : library.ClientSecretPost(secret);
  }

  private assertConfigured(provider: IdentityProviderConfiguration): void {
    if (
      provider.protocol !== 'OIDC' ||
      !provider.clientId ||
      !provider.clientSecretRef
    ) {
      throw new BadRequestException(
        'OIDC configuration requires clientId and clientSecretRef',
      );
    }
  }

  private requireEndpoint(value: string | undefined, field: string): string {
    if (!value) {
      throw new BadRequestException(
        `OIDC discovery metadata is missing ${field}`,
      );
    }
    return this.runtime.assertApprovedExternalUrl(value, field).toString();
  }

  private isDependencyFailure(error: unknown): boolean {
    return (
      error instanceof TypeError ||
      (error instanceof Error &&
        /(fetch failed|timeout|timed out|ECONN|ENOTFOUND|EAI_AGAIN)/i.test(
          `${error.message} ${(error as Error & { cause?: unknown }).cause ?? ''}`,
        ))
    );
  }

  private stringClaim(
    claims: Record<string, unknown>,
    name: string,
  ): string | undefined {
    const value = claims[name];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private library(): Promise<OpenIdClientModule> {
    return import('openid-client');
  }
}
