import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { EntityManager } from 'typeorm';
import { FederationRuntimeService } from './federation-runtime.service';
import {
  IdentityProviderConfiguration,
  PinnedOidcMetadata,
} from './identity-provider-configuration.entity';

const APPROVED_SIGNING_ALGORITHMS = new Set(['PS256', 'RS256', 'ES256']);

@Injectable()
export class ZoikoIdProviderBootstrapService {
  constructor(
    private readonly config: ConfigService,
    private readonly runtime: FederationRuntimeService,
  ) {}

  async provisionForTenant(
    manager: EntityManager,
    input: {
      tenantId: string;
      environmentId: string;
      actorId: string;
    },
  ): Promise<IdentityProviderConfiguration> {
    const issuer = this.required('ZOIKOID_OIDC_ISSUER');
    const clientId = this.required('ZOIKOID_OIDC_CLIENT_ID');
    const clientSecretRef = this.config.get<string>(
      'ZOIKOID_OIDC_CLIENT_SECRET_REF',
      'ZOIKOID_OIDC_CLIENT_SECRET',
    );
    const signingAlgorithm = this.config.get<string>(
      'ZOIKOID_OIDC_SIGNING_ALGORITHM',
      'RS256',
    );
    if (!APPROVED_SIGNING_ALGORITHMS.has(signingAlgorithm)) {
      throw new BadRequestException(
        'ZOIKOID_OIDC_SIGNING_ALGORITHM must be PS256, RS256 or ES256',
      );
    }

    const metadata: PinnedOidcMetadata = {
      issuer: this.runtime
        .assertApprovedExternalUrl(issuer, 'ZOIKOID_OIDC_ISSUER')
        .toString()
        .replace(/\/$/, ''),
      authorization_endpoint: this.approvedUrl(
        'ZOIKOID_OIDC_AUTHORIZATION_ENDPOINT',
      ),
      token_endpoint: this.approvedUrl('ZOIKOID_OIDC_TOKEN_ENDPOINT'),
      jwks_uri: this.approvedUrl('ZOIKOID_OIDC_JWKS_URI'),
      scopes_supported: ['openid', 'profile', 'email'],
      claims_supported: ['sub', 'email', 'email_verified', 'name', 'amr'],
      code_challenge_methods_supported: ['S256'],
      id_token_signing_alg_values_supported: [signingAlgorithm],
      token_endpoint_auth_methods_supported: ['client_secret_basic'],
      response_types_supported: ['code'],
    };
    if (metadata.issuer !== issuer.replace(/\/$/, '')) {
      throw new BadRequestException(
        'ZOIKOID_OIDC_ISSUER must use its canonical URL form',
      );
    }

    // Fail before persisting the provider if its secret-manager reference is
    // unavailable. The secret itself is never stored in this row.
    this.runtime.resolveSecret(clientSecretRef);

    const repository = manager.getRepository(IdentityProviderConfiguration);
    return repository.save(
      repository.create({
        tenantId: input.tenantId,
        environmentId: input.environmentId,
        name: 'ZoikoID',
        protocol: 'OIDC',
        status: 'ACTIVE',
        issuer: metadata.issuer,
        clientId,
        clientSecretRef,
        oidcClientAuthMethod: 'client_secret_basic',
        oidcMetadata: metadata,
        oidcSigningAlgorithm: signingAlgorithm,
        samlEntryPoint: null,
        samlIdpCertificates: [],
        samlSpEntityId: null,
        samlSpPrivateKeyRef: null,
        samlSpPublicCertificate: null,
        emailClaim: 'email',
        displayNameClaim: 'name',
        groupsClaim: null,
        mfaClaimValues: ['mfa', 'otp', 'hwk', 'fido', 'webauthn'],
        requireMfa:
          this.config.get<string>('ZOIKOID_REQUIRE_MFA', 'true') !== 'false',
        allowedClockSkewMs: 120000,
        metadataHash: createHash('sha256')
          .update(JSON.stringify(metadata))
          .digest('hex'),
        metadataValidatedAt: new Date(),
        createdByPrincipalId: input.actorId,
        updatedByPrincipalId: input.actorId,
      }),
    );
  }

  private required(name: string): string {
    const value = this.config.get<string>(name)?.trim();
    if (!value) {
      throw new ServiceUnavailableException(
        `${name} is required before tenant-owner invitations can be issued`,
      );
    }
    return value;
  }

  private approvedUrl(name: string): string {
    return this.runtime
      .assertApprovedExternalUrl(this.required(name), name)
      .toString();
  }
}
