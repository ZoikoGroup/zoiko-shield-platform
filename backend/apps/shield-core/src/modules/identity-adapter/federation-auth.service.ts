import {
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { StartSsoDto } from './dto/start-sso.dto';
import type { ExternalIdentity } from './external-identity.entity';
import { FederationRuntimeService } from './federation-runtime.service';
import { FederationTransactionService } from './federation-transaction.service';
import { IdentityEventService } from './identity-event.service';
import { IdentityProviderConfigurationService } from './identity-provider-configuration.service';
import { FederationAssertion } from './interfaces/federation-assertion.interface';
import { OidcFederationService } from './oidc-federation.service';
import type { Principal } from './principal.entity';
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
    private readonly prisma: PrismaService,
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

    const existingIdentity = await this.prisma.externalIdentity.findUnique({
      where: {
        issuer_subject: {
          issuer: assertion.issuer,
          subject: assertion.subject,
        },
      },
    });
    if (existingIdentity) {
      const existingTenantBinding =
        await this.prisma.externalIdentityTenantBinding.findUnique({
          where: {
            externalIdentityId_tenantId: {
              externalIdentityId: existingIdentity.id,
              tenantId,
            },
          },
        });
      if (existingTenantBinding?.status === 'SUSPENDED') {
        throw new ForbiddenException(
          'Federated identity access is suspended for this tenant',
        );
      }
      const principal = (await this.prisma.principal.findUnique({
        where: { id: existingIdentity.principalId },
      })) as Principal | null;
      if (!principal || principal.status !== 'ACTIVE') {
        throw new UnauthorizedException('Principal is not active');
      }
      const membership = await this.prisma.tenantMembership.findFirst({
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
      const externalIdentity = (await this.prisma.externalIdentity.update({
        where: { id: existingIdentity.id },
        data: {
          claimProfile: assertion.claimProfile as Prisma.InputJsonValue,
          lastSyncedAt: new Date(),
          verificationState: 'VERIFIED',
        },
      })) as ExternalIdentity;
      return { principal, externalIdentity };
    }

    if (!invitationToken) {
      throw new ForbiddenException(
        'ACTIVE_TENANT_MEMBERSHIP_REQUIRED: First sign-in requires a tenant invitation',
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const invitation = await tx.invitation.findFirst({
          where: {
            tokenHash: this.hashToken(invitationToken),
            tenantId,
            purpose: 'TENANT_MEMBERSHIP',
            status: 'PENDING',
            expiresAt: { gt: new Date() },
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
        // Exact case-insensitive match. Prisma's `mode: 'insensitive'` compiles
        // to ILIKE, where `_` and `%` in an address would act as wildcards and
        // could link the identity to a different principal.
        const [emailMatch] = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM identity.principals
          WHERE LOWER(email) = LOWER(${assertion.email})
          LIMIT 1`;
        const existingByEmail = emailMatch
          ? ((await tx.principal.findUnique({
              where: { id: emailMatch.id },
            })) as Principal | null)
          : null;
        const role = await tx.role.findUnique({
          where: { id: invitation.roleId },
        });
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
          ((await tx.principal.create({
            data: {
              principalType: 'HUMAN',
              status: 'ACTIVE',
              source: protocol,
              riskState: 'NORMAL',
              email: assertion.email.trim().toLowerCase(),
              fullName: assertion.fullName,
              emailVerified: true,
              lastLoginAt: null,
              terminatedAt: null,
            },
          })) as Principal);
        const createdExternalIdentity = (await tx.externalIdentity.create({
          data: {
            principalId: principal.id,
            issuer: assertion.issuer,
            subject: assertion.subject,
            provider: protocol,
            claimProfile: assertion.claimProfile as Prisma.InputJsonValue,
            verificationState: 'VERIFIED',
            lastSyncedAt: new Date(),
          },
        })) as ExternalIdentity;
        const existingMembership = await tx.tenantMembership.findUnique({
          where: {
            tenantId_principalId: { tenantId, principalId: principal.id },
          },
          include: { roles: true },
        });
        const membershipCreated = !existingMembership;
        if (existingMembership && existingMembership.status !== 'ACTIVE') {
          throw new ForbiddenException(
            'The tenant membership must be explicitly reactivated before identity linking',
          );
        }
        let membershipId: string;
        if (!existingMembership) {
          const created = await tx.tenantMembership.create({
            data: {
              tenantId,
              principalId: principal.id,
              status: 'ACTIVE',
              source: 'INVITATION',
              roles: { create: [{ role_id: role.id }] },
            },
          });
          membershipId = created.id;
        } else {
          membershipId = existingMembership.id;
          if (
            !existingMembership.roles.some(
              (assigned) => assigned.role_id === role.id,
            )
          ) {
            await tx.userRole.create({
              data: { membership_id: existingMembership.id, role_id: role.id },
            });
          }
        }
        await tx.invitation.update({
          where: { id: invitation.id },
          data: {
            status: 'ACCEPTED',
            acceptedAt: new Date(),
            acceptedById: principal.id,
          },
        });
        await tx.identityEvent.createMany({
          data: [
            {
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
            },
            {
              eventType: membershipCreated
                ? 'tenant_membership_created'
                : 'tenant_membership_changed',
              principalId: principal.id,
              actorId: principal.id,
              tenantId,
              data: {
                membershipId,
                source: 'INVITATION',
                roleId: role.id,
              },
            },
          ],
        });
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
    const binding = await this.prisma.externalIdentityTenantBinding.findUnique({
      where: { externalIdentityId_tenantId: { externalIdentityId, tenantId } },
    });
    if (!binding) {
      await this.prisma.externalIdentityTenantBinding.create({
        data: {
          externalIdentityId,
          tenantId,
          identityProviderConfigurationId,
          status: 'ACTIVE',
          lastAuthenticatedAt: new Date(),
        },
      });
    } else {
      await this.prisma.externalIdentityTenantBinding.update({
        where: { id: binding.id },
        data: {
          identityProviderConfigurationId,
          status: 'ACTIVE',
          lastAuthenticatedAt: new Date(),
        },
      });
    }
  }

  private async assertInvitationMatchesTenantAndIdentity(
    invitationToken: string,
    tenantId: string,
    verifiedEmail: string,
  ): Promise<void> {
    const invitation = await this.prisma.invitation.findFirst({
      where: {
        tokenHash: this.hashToken(invitationToken),
        tenantId,
        purpose: 'TENANT_MEMBERSHIP',
        status: 'PENDING',
        expiresAt: { gt: new Date() },
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
