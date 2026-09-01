import {
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { DataSource, MoreThan, Raw, Repository } from 'typeorm';
import { AuthorizationService } from '../authorization/authorization.service';
import { Invitation } from '../authorization/entities/invitation.entity';
import { Role } from '../authorization/entities/role.entity';
import { TenantMembership } from '../authorization/entities/tenant-membership.entity';
import { StartSsoDto } from './dto/start-sso.dto';
import { ExternalIdentityTenantBinding } from './external-identity-tenant-binding.entity';
import { ExternalIdentity } from './external-identity.entity';
import { FederationRuntimeService } from './federation-runtime.service';
import { FederationTransactionService } from './federation-transaction.service';
import { IdentityEvent } from './identity-event.entity';
import { IdentityEventService } from './identity-event.service';
import { IdentityProviderConfigurationService } from './identity-provider-configuration.service';
import { FederationAssertion } from './interfaces/federation-assertion.interface';
import { OidcFederationService } from './oidc-federation.service';
import { Principal } from './principal.entity';
import { SamlFederationService } from './saml-federation.service';
import { SessionContextService } from './session-context.service';
import { SessionMetadata } from './session.service';
import { AuthService, TokenPair } from './auth.service';
import { AuthenticatedUser } from './interfaces/jwt-payload.interface';
import {
  OwnerFederatedActivationService,
  OwnerInvitationConsent,
} from './owner-federated-activation.service';

export interface FederationLoginResult {
  user: AuthenticatedUser;
  tokens: TokenPair;
  redirectUrl: string;
}

@Injectable()
export class FederationAuthService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ExternalIdentityTenantBinding)
    private readonly bindings: Repository<ExternalIdentityTenantBinding>,
    private readonly providers: IdentityProviderConfigurationService,
    private readonly transactions: FederationTransactionService,
    private readonly oidc: OidcFederationService,
    private readonly saml: SamlFederationService,
    private readonly sessionContext: SessionContextService,
    private readonly authorization: AuthorizationService,
    private readonly auth: AuthService,
    private readonly runtime: FederationRuntimeService,
    private readonly events: IdentityEventService,
    private readonly ownerActivations: OwnerFederatedActivationService,
  ) {}

  async start(
    dto: StartSsoDto,
    metadata: SessionMetadata,
  ): Promise<{ authorizationUrl: string; protocol: string }> {
    return this.startTransaction(dto, metadata);
  }

  async startOwnerInvitation(
    input: StartSsoDto & {
      invitationToken: string;
      accessDisclosureVersion: string;
      accessDisclosureAcceptedAt: string;
    },
    metadata: SessionMetadata,
  ): Promise<{ authorizationUrl: string; protocol: string }> {
    return this.startTransaction(input, metadata, {
      accessDisclosureVersion: input.accessDisclosureVersion,
      accessDisclosureAcceptedAt: input.accessDisclosureAcceptedAt,
    });
  }

  private async startTransaction(
    dto: StartSsoDto,
    metadata: SessionMetadata,
    ownerConsent?: {
      accessDisclosureVersion: string;
      accessDisclosureAcceptedAt: string;
    },
  ): Promise<{ authorizationUrl: string; protocol: string }> {
    const provider = await this.providers.findActiveForStart(
      dto.tenantSlug,
      dto.identityProviderId,
    );
    const nonce = randomBytes(32).toString('base64url');
    const pkceCodeVerifier = randomBytes(48).toString('base64url');
    const state = await this.transactions.create({
      identityProviderConfigurationId: provider.id,
      tenantId: provider.tenantId,
      environmentId: provider.environmentId,
      protocol: provider.protocol,
      secrets: {
        ...(provider.protocol === 'OIDC' ? { nonce, pkceCodeVerifier } : {}),
        ...(dto.invitationToken
          ? { invitationToken: dto.invitationToken }
          : {}),
        ...(ownerConsent ?? {}),
        returnTo: dto.returnTo ?? '/',
      },
      requestIp: metadata.ipAddress,
      requestUserAgent: metadata.userAgent,
    });
    const authorizationUrl =
      provider.protocol === 'OIDC'
        ? await this.oidc.buildAuthorizationUrl({
            provider,
            state,
            nonce,
            pkceCodeVerifier,
          })
        : await this.saml.buildAuthorizationUrl(provider, state);
    await this.events.record({
      eventType: 'federation_authentication_started',
      tenantId: provider.tenantId,
      data: {
        identityProviderConfigurationId: provider.id,
        protocol: provider.protocol,
      },
    });
    return { authorizationUrl, protocol: provider.protocol };
  }

  async completeOidc(
    input: { state: string; code: string },
    metadata: SessionMetadata,
  ): Promise<FederationLoginResult> {
    const consumed = await this.transactions.consume(input.state, 'OIDC');
    const provider = await this.providers.findActiveById(
      consumed.transaction.identityProviderConfigurationId,
    );
    this.assertTransactionBinding(consumed.transaction, provider);
    if (!consumed.secrets.nonce || !consumed.secrets.pkceCodeVerifier) {
      throw new UnauthorizedException('Federation transaction is incomplete');
    }
    try {
      const assertion = await this.oidc.validateCallback({
        provider,
        state: input.state,
        code: input.code,
        nonce: consumed.secrets.nonce,
        pkceCodeVerifier: consumed.secrets.pkceCodeVerifier,
      });
      return await this.finishLogin(
        provider,
        assertion,
        consumed.secrets.invitationToken,
        consumed.secrets.returnTo,
        metadata,
        {
          accessDisclosureVersion: consumed.secrets.accessDisclosureVersion,
          accessDisclosureAcceptedAt:
            consumed.secrets.accessDisclosureAcceptedAt,
          metadata: {
            ipAddress: consumed.transaction.requestIp ?? undefined,
            userAgent: consumed.transaction.requestUserAgent ?? undefined,
          },
        },
      );
    } catch (error) {
      await this.recordFailure(provider.id, provider.tenantId, 'OIDC', error);
      throw error;
    }
  }

  async completeSaml(
    input: { relayState: string; samlResponse: string },
    metadata: SessionMetadata,
  ): Promise<FederationLoginResult> {
    const consumed = await this.transactions.consume(input.relayState, 'SAML');
    const provider = await this.providers.findActiveById(
      consumed.transaction.identityProviderConfigurationId,
    );
    this.assertTransactionBinding(consumed.transaction, provider);
    try {
      const assertion = await this.saml.validateCallback(
        provider,
        input.samlResponse,
      );
      return await this.finishLogin(
        provider,
        assertion,
        consumed.secrets.invitationToken,
        consumed.secrets.returnTo,
        metadata,
        {
          accessDisclosureVersion: consumed.secrets.accessDisclosureVersion,
          accessDisclosureAcceptedAt:
            consumed.secrets.accessDisclosureAcceptedAt,
          metadata: {
            ipAddress: consumed.transaction.requestIp ?? undefined,
            userAgent: consumed.transaction.requestUserAgent ?? undefined,
          },
        },
      );
    } catch (error) {
      await this.recordFailure(provider.id, provider.tenantId, 'SAML', error);
      throw error;
    }
  }

  private async finishLogin(
    provider: Awaited<
      ReturnType<IdentityProviderConfigurationService['findActiveById']>
    >,
    assertion: FederationAssertion,
    invitationToken: string | undefined,
    returnTo: string | undefined,
    metadata: SessionMetadata,
    ownerConsent: OwnerInvitationConsent,
  ): Promise<FederationLoginResult> {
    const resolved = await this.resolvePrincipal(
      provider.id,
      provider.tenantId,
      provider.protocol,
      assertion,
      invitationToken,
      ownerConsent,
    );
    const binding = await this.sessionContext.resolveBinding({
      principalId: resolved.principal.id,
      tenantId: provider.tenantId,
      environmentId: provider.environmentId,
      authenticationMethod: provider.protocol,
      issuer: assertion.issuer,
      riskState: resolved.principal.riskState,
    });
    await this.bindExternalIdentityToTenant(
      resolved.externalIdentity.id,
      provider.tenantId,
      provider.id,
    );
    const { user, ...tokens } = await this.auth.issueFederatedSession(
      resolved.principal,
      assertion.assurance,
      binding,
      metadata,
      {
        issuer: assertion.issuer,
        protocol: provider.protocol,
        identityProviderConfigurationId: provider.id,
      },
    );
    return {
      user,
      tokens,
      redirectUrl: this.runtime.applicationRedirect(returnTo ?? '/'),
    };
  }

  private async resolvePrincipal(
    providerConfigurationId: string,
    tenantId: string,
    protocol: 'OIDC' | 'SAML',
    assertion: FederationAssertion,
    invitationToken?: string,
    ownerConsent?: OwnerInvitationConsent,
  ): Promise<{ principal: Principal; externalIdentity: ExternalIdentity }> {
    if (
      invitationToken &&
      (await this.ownerActivations.isOwnerInvitation(invitationToken, tenantId))
    ) {
      return this.ownerActivations.complete({
        providerConfigurationId,
        tenantId,
        protocol,
        assertion,
        invitationToken,
        consent: ownerConsent ?? { metadata: {} },
      });
    }

    const externalRepository = this.dataSource.getRepository(ExternalIdentity);
    let externalIdentity = await externalRepository.findOne({
      where: { issuer: assertion.issuer, subject: assertion.subject },
    });
    if (externalIdentity) {
      const existingTenantBinding = await this.bindings.findOne({
        where: { externalIdentityId: externalIdentity.id, tenantId },
      });
      if (existingTenantBinding?.status === 'SUSPENDED') {
        throw new ForbiddenException(
          'Federated identity access is suspended for this tenant',
        );
      }
      const principal = await this.dataSource
        .getRepository(Principal)
        .findOne({ where: { id: externalIdentity.principalId } });
      if (!principal || principal.status !== 'ACTIVE') {
        throw new UnauthorizedException('Principal is not active');
      }
      const membership = await this.dataSource
        .getRepository(TenantMembership)
        .findOne({
          where: { tenantId, principalId: principal.id, status: 'ACTIVE' },
        });
      if (!membership && invitationToken) {
        await this.assertInvitationMatchesTenantAndIdentity(
          invitationToken,
          tenantId,
          assertion.email,
        );
        await this.authorization.acceptInvitation(
          invitationToken,
          principal.id,
          assertion.email,
        );
      }
      externalIdentity.claimProfile = assertion.claimProfile;
      externalIdentity.lastSyncedAt = new Date();
      externalIdentity.verificationState = 'VERIFIED';
      externalIdentity = await externalRepository.save(externalIdentity);
      return { principal, externalIdentity };
    }

    if (!invitationToken) {
      throw new ForbiddenException(
        'ACTIVE_TENANT_MEMBERSHIP_REQUIRED: First sign-in requires a tenant invitation',
      );
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        const invitations = manager.getRepository(Invitation);
        const invitation = await invitations.findOne({
          where: {
            tokenHash: this.hashToken(invitationToken),
            tenantId,
            purpose: 'TENANT_MEMBERSHIP',
            status: 'PENDING',
            expiresAt: MoreThan(new Date()),
          },
        });
        if (!invitation) {
          throw new ForbiddenException(
            'Invitation is invalid, expired, already used or belongs to another tenant',
          );
        }
        if (
          invitation.invitedEmail.toLowerCase() !==
          assertion.email.toLowerCase()
        ) {
          throw new ForbiddenException(
            'The verified federated identity does not match the invitation destination',
          );
        }
        const existingByEmail = await manager.getRepository(Principal).findOne({
          where: {
            email: Raw((column) => `LOWER(${column}) = LOWER(:email)`, {
              email: assertion.email,
            }),
          },
        });
        const role = await manager
          .getRepository(Role)
          .findOne({ where: { id: invitation.roleId } });
        if (
          !role ||
          role.roleLevel !== 'TENANT' ||
          (role.tenantId && role.tenantId !== tenantId)
        ) {
          throw new ForbiddenException(
            'The invitation role is no longer approved for this tenant',
          );
        }
        if (existingByEmail && existingByEmail.status !== 'ACTIVE') {
          throw new ForbiddenException(
            'The pre-provisioned principal is not active',
          );
        }
        const principal =
          existingByEmail ??
          (await manager.getRepository(Principal).save(
            manager.getRepository(Principal).create({
              principalType: 'HUMAN',
              status: 'ACTIVE',
              source: protocol,
              riskState: 'NORMAL',
              email: assertion.email.trim().toLowerCase(),
              fullName: assertion.fullName,
              emailVerified: true,
              lastLoginAt: null,
              terminatedAt: null,
            }),
          ));
        const createdExternalIdentity = await manager
          .getRepository(ExternalIdentity)
          .save(
            manager.getRepository(ExternalIdentity).create({
              principalId: principal.id,
              issuer: assertion.issuer,
              subject: assertion.subject,
              provider: protocol,
              claimProfile: assertion.claimProfile,
              verificationState: 'VERIFIED',
              lastSyncedAt: new Date(),
            }),
          );
        const membershipRepository = manager.getRepository(TenantMembership);
        let membership = await membershipRepository.findOne({
          where: { tenantId, principalId: principal.id },
          relations: { roles: true },
        });
        const membershipCreated = !membership;
        if (membership && membership.status !== 'ACTIVE') {
          throw new ForbiddenException(
            'The tenant membership must be explicitly reactivated before identity linking',
          );
        }
        if (!membership) {
          membership = membershipRepository.create({
            tenantId,
            principalId: principal.id,
            status: 'ACTIVE',
            source: 'INVITATION',
            roles: [role],
          });
        } else if (
          !membership.roles.some((assigned) => assigned.id === role.id)
        ) {
          membership.roles.push(role);
        }
        membership = await membershipRepository.save(membership);
        invitation.status = 'ACCEPTED';
        invitation.acceptedAt = new Date();
        invitation.acceptedById = principal.id;
        await invitations.save(invitation);
        const eventRepository = manager.getRepository(IdentityEvent);
        await eventRepository.save([
          eventRepository.create({
            eventType: existingByEmail
              ? 'external_identity_linked'
              : 'principal_created',
            principalId: principal.id,
            actorId: principal.id,
            tenantId,
            data: {
              source: protocol,
              issuer: assertion.issuer,
              identityProviderConfigurationId: providerConfigurationId,
              ...(existingByEmail
                ? { linkingMethod: 'VERIFIED_TENANT_INVITATION' }
                : {}),
            },
          }),
          eventRepository.create({
            eventType: membershipCreated
              ? 'tenant_membership_created'
              : 'tenant_membership_changed',
            principalId: principal.id,
            actorId: principal.id,
            tenantId,
            data: {
              membershipId: membership.id,
              source: 'INVITATION',
              roleId: role.id,
            },
          }),
        ]);
        return {
          principal,
          externalIdentity: createdExternalIdentity,
        };
      });
    } catch (error) {
      if (
        error instanceof Error &&
        /duplicate key|unique constraint/i.test(error.message)
      ) {
        throw new ConflictException(
          'Federated identity was linked concurrently; restart company SSO',
        );
      }
      throw error;
    }
  }

  private async bindExternalIdentityToTenant(
    externalIdentityId: string,
    tenantId: string,
    identityProviderConfigurationId: string,
  ): Promise<void> {
    let binding = await this.bindings.findOne({
      where: { externalIdentityId, tenantId },
    });
    if (!binding) {
      binding = this.bindings.create({
        externalIdentityId,
        tenantId,
        identityProviderConfigurationId,
        status: 'ACTIVE',
        lastAuthenticatedAt: new Date(),
      });
    } else {
      binding.identityProviderConfigurationId = identityProviderConfigurationId;
      binding.status = 'ACTIVE';
      binding.lastAuthenticatedAt = new Date();
    }
    await this.bindings.save(binding);
  }

  private async assertInvitationMatchesTenantAndIdentity(
    invitationToken: string,
    tenantId: string,
    verifiedEmail: string,
  ): Promise<void> {
    const invitation = await this.dataSource.getRepository(Invitation).findOne({
      where: {
        tokenHash: this.hashToken(invitationToken),
        tenantId,
        purpose: 'TENANT_MEMBERSHIP',
        status: 'PENDING',
        expiresAt: MoreThan(new Date()),
      },
    });
    if (
      !invitation ||
      invitation.invitedEmail.toLowerCase() !== verifiedEmail.toLowerCase()
    ) {
      throw new ForbiddenException(
        'Invitation is invalid, expired, already used, belongs to another tenant, or does not match the verified identity',
      );
    }
  }

  private assertTransactionBinding(
    transaction: {
      tenantId: string;
      environmentId: string;
      protocol: string;
    },
    provider: {
      tenantId: string;
      environmentId: string;
      protocol: string;
    },
  ) {
    if (
      transaction.tenantId !== provider.tenantId ||
      transaction.environmentId !== provider.environmentId ||
      transaction.protocol !== provider.protocol
    ) {
      throw new UnauthorizedException(
        'Federation transaction does not match the approved tenant configuration',
      );
    }
  }

  private async recordFailure(
    providerId: string,
    tenantId: string,
    protocol: string,
    error: unknown,
  ): Promise<void> {
    await this.events.record({
      eventType: 'federation_authentication_failed',
      tenantId,
      data: {
        identityProviderConfigurationId: providerId,
        protocol,
        reason:
          error instanceof ForbiddenException
            ? 'MEMBERSHIP_OR_POLICY_DENIED'
            : error instanceof ServiceUnavailableException
              ? 'FEDERATION_DEPENDENCY_UNAVAILABLE'
              : 'ASSERTION_OR_DEPENDENCY_FAILURE',
      },
    });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
