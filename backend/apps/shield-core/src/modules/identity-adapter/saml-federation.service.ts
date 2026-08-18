import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { SAML, ValidateInResponseTo } from '@node-saml/node-saml';
import type { Profile } from '@node-saml/node-saml';
import {
  X509Certificate,
  createHash,
  createPrivateKey,
  createPublicKey,
} from 'crypto';
import { DatabaseSamlCacheProvider } from './database-saml-cache.provider';
import { FederationRuntimeService } from './federation-runtime.service';
import { IdentityProviderConfiguration } from './identity-provider-configuration.entity';
import { FederationAssertion } from './interfaces/federation-assertion.interface';

@Injectable()
export class SamlFederationService {
  constructor(
    private readonly runtime: FederationRuntimeService,
    private readonly cacheProvider: DatabaseSamlCacheProvider,
  ) {}

  validateConfiguration(provider: IdentityProviderConfiguration): string {
    this.assertConfigured(provider);
    this.runtime.assertApprovedExternalUrl(
      provider.samlEntryPoint!,
      'samlEntryPoint',
    );
    const idpCertificateFingerprints: string[] = [];
    for (const certificate of provider.samlIdpCertificates) {
      let parsed: X509Certificate;
      try {
        parsed = new X509Certificate(certificate);
      } catch {
        throw new BadRequestException(
          'Every SAML IdP certificate must be a valid X.509 certificate',
        );
      }
      if (Date.parse(parsed.validTo) <= Date.now()) {
        throw new BadRequestException('A SAML IdP certificate has expired');
      }
      if (
        Date.parse(parsed.validFrom) >
        Date.now() + provider.allowedClockSkewMs
      ) {
        throw new BadRequestException(
          'A SAML IdP certificate is not yet valid',
        );
      }
      idpCertificateFingerprints.push(parsed.fingerprint256);
    }
    let spSigningPublicKeyHash: string | null = null;
    if (provider.samlSpPrivateKeyRef) {
      try {
        const privateKey = createPrivateKey(
          this.runtime.resolveSecret(provider.samlSpPrivateKeyRef)!,
        );
        spSigningPublicKeyHash = createHash('sha256')
          .update(
            createPublicKey(privateKey).export({
              type: 'spki',
              format: 'der',
            }),
          )
          .digest('hex');
      } catch {
        throw new BadRequestException(
          'The SAML SP private-key reference does not resolve to a valid private key',
        );
      }
    }
    let spCertificateFingerprint: string | null = null;
    if (provider.samlSpPublicCertificate) {
      try {
        const certificate = new X509Certificate(
          provider.samlSpPublicCertificate,
        );
        if (Date.parse(certificate.validTo) <= Date.now()) {
          throw new Error('expired');
        }
        spCertificateFingerprint = certificate.fingerprint256;
      } catch {
        throw new BadRequestException(
          'The SAML SP public certificate is invalid or expired',
        );
      }
    }
    return createHash('sha256')
      .update(
        JSON.stringify({
          issuer: provider.issuer,
          entryPoint: provider.samlEntryPoint,
          spEntityId: provider.samlSpEntityId,
          idpCertificateFingerprints,
          spSigningPublicKeyHash,
          spCertificateFingerprint,
          emailClaim: provider.emailClaim,
          displayNameClaim: provider.displayNameClaim,
          groupsClaim: provider.groupsClaim,
          mfaClaimValues: provider.mfaClaimValues,
          requireMfa: provider.requireMfa,
          allowedClockSkewMs: provider.allowedClockSkewMs,
        }),
      )
      .digest('hex');
  }

  async buildAuthorizationUrl(
    provider: IdentityProviderConfiguration,
    state: string,
  ): Promise<string> {
    if (provider.status !== 'ACTIVE') {
      throw new ServiceUnavailableException(
        'FEDERATION_UNAVAILABLE: SAML configuration is not active',
      );
    }
    return this.client(provider).getAuthorizeUrlAsync(state, undefined, {});
  }

  async validateCallback(
    provider: IdentityProviderConfiguration,
    samlResponse: string,
  ): Promise<FederationAssertion> {
    let profile: Profile | null;
    try {
      ({ profile } = await this.client(provider).validatePostResponseAsync({
        SAMLResponse: samlResponse,
      }));
    } catch {
      throw new UnauthorizedException(
        'FEDERATION_ASSERTION_REJECTED: SAML response validation failed',
      );
    }
    if (!profile || profile.issuer !== provider.issuer || !profile.nameID) {
      throw new UnauthorizedException(
        'FEDERATION_ASSERTION_REJECTED: SAML issuer or subject mismatch',
      );
    }
    const email = this.stringAttribute(profile, provider.emailClaim);
    if (!email) {
      throw new UnauthorizedException(
        'FEDERATION_ASSERTION_REJECTED: SAML assertion has no configured email attribute',
      );
    }
    const authnContext = this.stringAttribute(profile, 'authnContext');
    const acceptedMfaValues = (
      provider.mfaClaimValues.length
        ? provider.mfaClaimValues
        : [
            'urn:oasis:names:tc:SAML:2.0:ac:classes:TimeSyncToken',
            'urn:oasis:names:tc:SAML:2.0:ac:classes:Smartcard',
            'urn:oasis:names:tc:SAML:2.0:ac:classes:SmartcardPKI',
            'http://schemas.microsoft.com/claims/multipleauthn',
          ]
    ).map((value) => value.toLowerCase());
    const hasMfa = Boolean(
      authnContext && acceptedMfaValues.includes(authnContext.toLowerCase()),
    );
    if (provider.requireMfa && !hasMfa) {
      throw new UnauthorizedException(
        'STEP_UP_REQUIRED: The identity provider did not assert MFA',
      );
    }
    const fullName = this.stringAttribute(profile, provider.displayNameClaim);
    const groups = provider.groupsClaim
      ? profile[provider.groupsClaim]
      : undefined;
    return {
      issuer: profile.issuer,
      subject: profile.nameID,
      email,
      fullName,
      assurance: hasMfa ? 'FEDERATED_MFA' : 'FEDERATED',
      claimProfile: {
        email,
        ...(fullName ? { name: fullName } : {}),
        ...(authnContext ? { authnContext } : {}),
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

  generateServiceProviderMetadata(
    provider: IdentityProviderConfiguration,
  ): string {
    return this.client(provider).generateServiceProviderMetadata(
      null,
      provider.samlSpPublicCertificate,
    );
  }

  private client(provider: IdentityProviderConfiguration): SAML {
    this.assertConfigured(provider);
    const privateKey = this.runtime.resolveSecret(provider.samlSpPrivateKeyRef);
    return new SAML({
      entryPoint: provider.samlEntryPoint!,
      issuer: provider.samlSpEntityId!,
      audience: provider.samlSpEntityId!,
      callbackUrl: this.runtime.callbackUrl('SAML'),
      idpCert: provider.samlIdpCertificates,
      ...(privateKey ? { privateKey } : {}),
      ...(provider.samlSpPublicCertificate
        ? { publicCert: provider.samlSpPublicCertificate }
        : {}),
      signatureAlgorithm: 'sha256',
      digestAlgorithm: 'sha256',
      wantAssertionsSigned: true,
      wantAuthnResponseSigned: true,
      acceptedClockSkewMs: provider.allowedClockSkewMs,
      maxAssertionAgeMs: 5 * 60 * 1000,
      validateInResponseTo: ValidateInResponseTo.always,
      requestIdExpirationPeriodMs: 10 * 60 * 1000,
      cacheProvider: this.cacheProvider,
      disableRequestedAuthnContext: false,
      forceAuthn: false,
    });
  }

  private assertConfigured(provider: IdentityProviderConfiguration): void {
    if (
      provider.protocol !== 'SAML' ||
      !provider.samlEntryPoint ||
      !provider.samlSpEntityId ||
      !provider.samlIdpCertificates.length
    ) {
      throw new BadRequestException(
        'SAML configuration requires entry point, SP entity ID and IdP certificates',
      );
    }
  }

  private stringAttribute(profile: Profile, name: string): string | undefined {
    const value = profile[name];
    if (typeof value === 'string' && value.length > 0) return value;
    if (
      Array.isArray(value) &&
      typeof value[0] === 'string' &&
      value[0].length > 0
    ) {
      return value[0];
    }
    return undefined;
  }
}
