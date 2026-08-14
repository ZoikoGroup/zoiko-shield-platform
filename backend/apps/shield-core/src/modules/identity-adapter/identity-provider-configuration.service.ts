import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { createHash } from 'crypto';
import { Environment } from '../environment/environment.entity';
import { Tenant } from '../tenant/tenant.entity';
import { CreateIdentityProviderDto } from './dto/create-identity-provider.dto';
import { UpdateIdentityProviderDto } from './dto/update-identity-provider.dto';
import { FederationRuntimeService } from './federation-runtime.service';
import {
  IdentityProviderConfiguration,
  PinnedOidcMetadata,
} from './identity-provider-configuration.entity';
import { IdentityEvent } from './identity-event.entity';
import { OidcFederationService } from './oidc-federation.service';
import { SamlFederationService } from './saml-federation.service';
import { Session } from './session.entity';

@Injectable()
export class IdentityProviderConfigurationService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(IdentityProviderConfiguration)
    private readonly providers: Repository<IdentityProviderConfiguration>,
    @InjectRepository(Tenant)
    private readonly tenants: Repository<Tenant>,
    @InjectRepository(Environment)
    private readonly environments: Repository<Environment>,
    private readonly oidc: OidcFederationService,
    private readonly saml: SamlFederationService,
    private readonly runtime: FederationRuntimeService,
  ) {}

  async create(
    tenantId: string,
    dto: CreateIdentityProviderDto,
    actorId: string,
  ): Promise<Record<string, unknown>> {
    await this.assertTenantAllowsConfiguration(tenantId);
    await this.assertEnvironment(tenantId, dto.environmentId);
    this.assertProtocolFields(dto);
    this.runtime.callbackUrl(dto.protocol);
    const existing = await this.providers.findOne({
      where: { tenantId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException(
        `Identity provider '${dto.name}' already exists for this tenant`,
      );
    }
    const provider = await this.persistConfigurationChange(
      this.providers.create({
        tenantId,
        environmentId: dto.environmentId,
        name: dto.name,
        protocol: dto.protocol,
        status: 'DRAFT',
        issuer: dto.issuer,
        clientId: dto.protocol === 'OIDC' ? (dto.clientId ?? null) : null,
        clientSecretRef:
          dto.protocol === 'OIDC' ? (dto.clientSecretRef ?? null) : null,
        oidcClientAuthMethod:
          dto.protocol === 'OIDC'
            ? (dto.oidcClientAuthMethod ?? 'client_secret_basic')
            : null,
        oidcMetadata: null,
        oidcSigningAlgorithm: null,
        samlEntryPoint:
          dto.protocol === 'SAML' ? (dto.samlEntryPoint ?? null) : null,
        samlIdpCertificates:
          dto.protocol === 'SAML' ? (dto.samlIdpCertificates ?? []) : [],
        samlSpEntityId:
          dto.protocol === 'SAML' ? (dto.samlSpEntityId ?? null) : null,
        samlSpPrivateKeyRef:
          dto.protocol === 'SAML' ? (dto.samlSpPrivateKeyRef ?? null) : null,
        samlSpPublicCertificate:
          dto.protocol === 'SAML'
            ? (dto.samlSpPublicCertificate ?? null)
            : null,
        emailClaim: dto.emailClaim ?? 'email',
        displayNameClaim: dto.displayNameClaim ?? 'name',
        groupsClaim: dto.groupsClaim ?? null,
        mfaClaimValues: dto.mfaClaimValues ?? [],
        requireMfa: dto.requireMfa ?? false,
        allowedClockSkewMs: dto.allowedClockSkewMs ?? 120000,
        metadataHash: null,
        metadataValidatedAt: null,
        createdByPrincipalId: actorId,
        updatedByPrincipalId: actorId,
      }),
      {
        eventType: 'identity_provider_configuration_created',
        actorId,
        tenantId,
        data: (saved) => ({
          identityProviderConfigurationId: saved.id,
          protocol: saved.protocol,
          status: saved.status,
        }),
      },
    );
    return this.publicConfiguration(provider);
  }

  async update(
    tenantId: string,
    providerId: string,
    dto: UpdateIdentityProviderDto,
    actorId: string,
  ): Promise<Record<string, unknown>> {
    await this.assertTenantAllowsConfiguration(tenantId);
    const provider = await this.findForTenant(tenantId, providerId);
    const previousIssuer = provider.issuer;
    if (dto.environmentId) {
      await this.assertEnvironment(tenantId, dto.environmentId);
    }
    Object.assign(provider, {
      ...dto,
      clientId: dto.clientId ?? provider.clientId,
      clientSecretRef: dto.clientSecretRef ?? provider.clientSecretRef,
      samlEntryPoint: dto.samlEntryPoint ?? provider.samlEntryPoint,
      samlIdpCertificates:
        dto.samlIdpCertificates ?? provider.samlIdpCertificates,
      samlSpEntityId: dto.samlSpEntityId ?? provider.samlSpEntityId,
      samlSpPrivateKeyRef:
        dto.samlSpPrivateKeyRef ?? provider.samlSpPrivateKeyRef,
      samlSpPublicCertificate:
        dto.samlSpPublicCertificate ?? provider.samlSpPublicCertificate,
      groupsClaim:
        dto.groupsClaim === undefined ? provider.groupsClaim : dto.groupsClaim,
      mfaClaimValues: dto.mfaClaimValues ?? provider.mfaClaimValues,
      updatedByPrincipalId: actorId,
      status: 'DRAFT',
      oidcMetadata: null,
      oidcSigningAlgorithm: null,
      metadataHash: null,
      metadataValidatedAt: null,
    });
    if (provider.protocol === 'OIDC') {
      provider.samlEntryPoint = null;
      provider.samlIdpCertificates = [];
      provider.samlSpEntityId = null;
      provider.samlSpPrivateKeyRef = null;
      provider.samlSpPublicCertificate = null;
      provider.oidcClientAuthMethod ??= 'client_secret_basic';
    } else {
      provider.clientId = null;
      provider.clientSecretRef = null;
      provider.oidcClientAuthMethod = null;
    }
    this.assertProtocolFields(provider);
    this.runtime.callbackUrl(provider.protocol);
    await this.persistConfigurationChange(
      provider,
      {
        eventType: 'identity_provider_configuration_changed',
        actorId,
        tenantId,
        data: (saved) => ({
          identityProviderConfigurationId: saved.id,
          protocol: saved.protocol,
          status: saved.status,
          changedFields: Object.keys(dto).filter(
            (field) =>
              !['clientSecretRef', 'samlSpPrivateKeyRef'].includes(field),
          ),
          secretReferenceChanged: Boolean(
            dto.clientSecretRef || dto.samlSpPrivateKeyRef,
          ),
          certificateRollover: dto.samlIdpCertificates !== undefined,
          issuerChanged: previousIssuer !== saved.issuer,
        }),
      },
      {
        tenantId,
        issuer: previousIssuer,
        reason: 'IDP_CONFIGURATION_CHANGED',
      },
    );
    return this.publicConfiguration(provider);
  }

  async activate(
    tenantId: string,
    providerId: string,
    actorId: string,
  ): Promise<Record<string, unknown>> {
    await this.assertTenantAllowsConfiguration(tenantId);
    const provider = await this.findForTenant(tenantId, providerId);
    this.assertProtocolFields(provider);
    this.runtime.callbackUrl(provider.protocol);

    let metadataHash: string;
    if (provider.protocol === 'OIDC') {
      const pinned = await this.oidc.discoverAndPin(provider);
      provider.oidcMetadata = pinned.metadata;
      provider.oidcSigningAlgorithm = pinned.signingAlgorithm;
      metadataHash = createHash('sha256')
        .update(
          JSON.stringify({
            discoveredMetadataHash: pinned.metadataHash,
            clientId: provider.clientId,
            clientAuthentication: provider.oidcClientAuthMethod,
            signingAlgorithm: pinned.signingAlgorithm,
            emailClaim: provider.emailClaim,
            displayNameClaim: provider.displayNameClaim,
            groupsClaim: provider.groupsClaim,
            mfaClaimValues: provider.mfaClaimValues,
            requireMfa: provider.requireMfa,
          }),
        )
        .digest('hex');
    } else {
      metadataHash = this.saml.validateConfiguration(provider);
    }
    provider.metadataHash = metadataHash;
    provider.metadataValidatedAt = new Date();
    provider.status = 'ACTIVE';
    provider.updatedByPrincipalId = actorId;
    await this.persistConfigurationChange(provider, {
      eventType: 'identity_provider_configuration_activated',
      actorId,
      tenantId,
      data: (saved) => ({
        identityProviderConfigurationId: saved.id,
        protocol: saved.protocol,
        metadataHash,
      }),
    });
    return this.publicConfiguration(provider);
  }

  async disable(
    tenantId: string,
    providerId: string,
    actorId: string,
  ): Promise<Record<string, unknown>> {
    const provider = await this.findForTenant(tenantId, providerId);
    provider.status = 'DISABLED';
    provider.updatedByPrincipalId = actorId;
    await this.persistConfigurationChange(
      provider,
      {
        eventType: 'identity_provider_configuration_disabled',
        actorId,
        tenantId,
        data: (saved) => ({
          identityProviderConfigurationId: saved.id,
          protocol: saved.protocol,
        }),
      },
      { tenantId, issuer: provider.issuer, reason: 'IDP_DISABLED' },
    );
    return this.publicConfiguration(provider);
  }

  async listForTenant(tenantId: string): Promise<Record<string, unknown>[]> {
    return (
      await this.providers.find({
        where: { tenantId },
        order: { createdAt: 'ASC' },
      })
    ).map((provider) => this.publicConfiguration(provider));
  }

  async discoverForTenantSlug(tenantSlug: string): Promise<{
    tenant: { id: string; name: string; slug: string };
    identityProviders: Array<{
      id: string;
      name: string;
      protocol: string;
    }>;
  }> {
    const tenant = await this.tenants.findOne({
      where: { slug: tenantSlug },
    });
    if (!tenant || !['ACTIVE', 'PROVISIONING'].includes(tenant.status)) {
      throw new NotFoundException('Company SSO configuration was not found');
    }
    const providers = await this.providers.find({
      where: { tenantId: tenant.id, status: 'ACTIVE' },
      order: { name: 'ASC' },
    });
    return {
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      identityProviders: providers.map((provider) => ({
        id: provider.id,
        name: provider.name,
        protocol: provider.protocol,
      })),
    };
  }

  async findActiveForStart(
    tenantSlug: string,
    providerId: string,
  ): Promise<IdentityProviderConfiguration> {
    const tenant = await this.tenants.findOne({
      where: { slug: tenantSlug },
    });
    if (!tenant || !['ACTIVE', 'PROVISIONING'].includes(tenant.status)) {
      throw new NotFoundException('Company SSO configuration was not found');
    }
    const provider = await this.providers.findOne({
      where: { id: providerId, tenantId: tenant.id, status: 'ACTIVE' },
    });
    if (!provider) {
      throw new NotFoundException('Company SSO configuration was not found');
    }
    return provider;
  }

  async findActiveById(
    providerId: string,
  ): Promise<IdentityProviderConfiguration> {
    const provider = await this.providers.findOne({
      where: { id: providerId, status: 'ACTIVE' },
    });
    if (!provider) {
      throw new NotFoundException('Company SSO configuration was not found');
    }
    return provider;
  }

  async samlMetadata(tenantSlug: string, providerId: string): Promise<string> {
    const provider = await this.findActiveForStart(tenantSlug, providerId);
    if (provider.protocol !== 'SAML') {
      throw new NotFoundException('SAML configuration was not found');
    }
    return this.saml.generateServiceProviderMetadata(provider);
  }

  async samlMetadataForTenant(
    tenantId: string,
    providerId: string,
  ): Promise<string> {
    const provider = await this.findForTenant(tenantId, providerId);
    if (provider.protocol !== 'SAML') {
      throw new NotFoundException('SAML configuration was not found');
    }
    return this.saml.generateServiceProviderMetadata(provider);
  }

  private async findForTenant(
    tenantId: string,
    providerId: string,
  ): Promise<IdentityProviderConfiguration> {
    const provider = await this.providers.findOne({
      where: { id: providerId, tenantId },
    });
    if (!provider) {
      throw new NotFoundException(
        `Identity provider configuration '${providerId}' not found`,
      );
    }
    return provider;
  }

  private async assertTenantAllowsConfiguration(tenantId: string) {
    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} not found`);
    if (!['PROVISIONING', 'ACTIVE'].includes(tenant.status)) {
      throw new ForbiddenException(
        `Identity provider configuration is unavailable while tenant is ${tenant.status}`,
      );
    }
  }

  private async assertEnvironment(tenantId: string, environmentId: string) {
    const environment = await this.environments.findOne({
      where: { id: environmentId, tenantId, status: 'ACTIVE' },
    });
    if (!environment) {
      throw new BadRequestException(
        'environmentId must identify an active environment owned by the tenant',
      );
    }
  }

  private assertProtocolFields(
    input:
      | CreateIdentityProviderDto
      | UpdateIdentityProviderDto
      | IdentityProviderConfiguration,
  ) {
    if (input.protocol === 'OIDC') {
      this.runtime.assertApprovedExternalUrl(input.issuer!, 'issuer');
      if (!input.clientId || !input.clientSecretRef) {
        throw new BadRequestException(
          'OIDC configuration requires clientId and clientSecretRef',
        );
      }
      return;
    }
    if (input.protocol === 'SAML') {
      if (
        !input.samlEntryPoint ||
        !input.samlSpEntityId ||
        !input.samlIdpCertificates?.length
      ) {
        throw new BadRequestException(
          'SAML configuration requires samlEntryPoint, samlSpEntityId and samlIdpCertificates',
        );
      }
      this.runtime.assertApprovedExternalUrl(
        input.samlEntryPoint,
        'samlEntryPoint',
      );
      return;
    }
    throw new BadRequestException('Unsupported federation protocol');
  }

  private async persistConfigurationChange(
    provider: IdentityProviderConfiguration,
    audit: {
      eventType: string;
      actorId: string;
      tenantId: string;
      data: (saved: IdentityProviderConfiguration) => Record<string, unknown>;
    },
    revoke?: { tenantId: string; issuer: string; reason: string },
  ): Promise<IdentityProviderConfiguration> {
    return this.dataSource.transaction(async (manager) => {
      const saved = await manager
        .getRepository(IdentityProviderConfiguration)
        .save(provider);
      if (revoke) {
        await manager.getRepository(Session).update(
          {
            tenantId: revoke.tenantId,
            issuer: revoke.issuer,
            revokedAt: IsNull(),
          },
          { revokedAt: new Date(), revokedReason: revoke.reason },
        );
      }
      const eventRepository = manager.getRepository(IdentityEvent);
      await eventRepository.save(
        eventRepository.create({
          eventType: audit.eventType,
          actorId: audit.actorId,
          principalId: null,
          tenantId: audit.tenantId,
          correlationId: null,
          data: audit.data(saved),
        }),
      );
      return saved;
    });
  }

  private publicConfiguration(
    provider: IdentityProviderConfiguration,
  ): Record<string, unknown> {
    return {
      id: provider.id,
      tenantId: provider.tenantId,
      environmentId: provider.environmentId,
      name: provider.name,
      protocol: provider.protocol,
      status: provider.status,
      issuer: provider.issuer,
      callbackUrl: this.safeCallbackUrl(provider.protocol),
      clientId: provider.clientId,
      hasClientSecretRef: Boolean(provider.clientSecretRef),
      oidcClientAuthMethod: provider.oidcClientAuthMethod,
      oidcMetadata: provider.oidcMetadata
        ? this.publicOidcMetadata(provider.oidcMetadata)
        : null,
      oidcSigningAlgorithm: provider.oidcSigningAlgorithm,
      samlEntryPoint: provider.samlEntryPoint,
      samlSpEntityId: provider.samlSpEntityId,
      samlCertificateCount: provider.samlIdpCertificates.length,
      hasSamlSpPrivateKeyRef: Boolean(provider.samlSpPrivateKeyRef),
      emailClaim: provider.emailClaim,
      displayNameClaim: provider.displayNameClaim,
      groupsClaim: provider.groupsClaim,
      mfaClaimValues: provider.mfaClaimValues,
      requireMfa: provider.requireMfa,
      allowedClockSkewMs: provider.allowedClockSkewMs,
      metadataHash: provider.metadataHash,
      metadataValidatedAt: provider.metadataValidatedAt,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    };
  }

  private publicOidcMetadata(metadata: PinnedOidcMetadata) {
    return {
      issuer: metadata.issuer,
      authorizationEndpoint: metadata.authorization_endpoint,
      tokenEndpoint: metadata.token_endpoint,
      jwksUri: metadata.jwks_uri,
    };
  }

  private safeCallbackUrl(protocol: 'OIDC' | 'SAML'): string | null {
    try {
      return this.runtime.callbackUrl(protocol);
    } catch {
      return null;
    }
  }
}
