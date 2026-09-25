import {
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { Invitation } from '../authorization/entities/invitation.entity';
import type { Environment } from '../environment/environment.entity';
import { FederationAuthService } from '../identity-adapter/federation-auth.service';
import type { IdentityProviderConfiguration } from '../identity-adapter/identity-provider-configuration.entity';
import type { PolicyDocument } from '../identity-adapter/policy-document.entity';
import { PolicyService } from '../identity-adapter/policy.service';
import type { Principal } from '../identity-adapter/principal.entity';
import type { SessionMetadata } from '../identity-adapter/session.service';
import type { Tenant } from '../tenant/tenant.entity';
import { StartOwnerActivationDto } from './dto/start-owner-activation.dto';
import { runWithTenantScope } from '../../../../../libs/database/src';

type OwnerInvitationContext = {
  invitation: Invitation;
  principal: Principal;
  tenant: Tenant;
  environment: Environment;
  policy: PolicyDocument;
  providers: IdentityProviderConfiguration[];
};

@Injectable()
export class OwnerActivationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly federation: FederationAuthService,
    private readonly policies: PolicyService,
  ) {}

  async inspect(token: string) {
    const context = await this.loadContext(token);
    return {
      tenant: {
        id: context.tenant.id,
        name: context.tenant.name,
        slug: context.tenant.slug,
        status: context.tenant.status,
      },
      environment: {
        id: context.environment.id,
        name: context.environment.name,
        type: context.environment.environmentType,
        region: context.environment.region,
      },
      owner: {
        email: this.maskEmail(context.invitation.invitedEmail),
        authentication: 'ZOIKOID',
      },
      accessDisclosure: {
        version: context.policy.version,
        contentHash: context.policy.contentHash,
        content: this.policies.contentFor(context.policy),
      },
      identityProviders: context.providers.map((provider) => ({
        id: provider.id,
        name: provider.name,
        protocol: provider.protocol,
      })),
      expiresAt: context.invitation.expiresAt,
    };
  }

  async start(
    token: string,
    dto: StartOwnerActivationDto,
    metadata: SessionMetadata,
  ) {
    const context = await this.loadContext(token);
    if (context.policy.version !== dto.accessDisclosureVersion) {
      throw new ConflictException(
        'The access disclosure has changed; reload the invitation',
      );
    }
    if (
      !context.providers.some(
        (provider) => provider.id === dto.identityProviderId,
      )
    ) {
      throw new NotFoundException(
        'The selected ZoikoID configuration is not available for this invitation',
      );
    }

    return this.federation.startOwnerInvitation(
      {
        tenantSlug: context.tenant.slug,
        identityProviderId: dto.identityProviderId,
        invitationToken: token,
        accessDisclosureVersion: dto.accessDisclosureVersion,
        accessDisclosureAcceptedAt: new Date().toISOString(),
        returnTo: dto.returnTo ?? '/invitation-complete',
      },
      metadata,
    );
  }

  private async loadContext(token: string): Promise<OwnerInvitationContext> {
    const invitation = (await this.prisma.invitation.findFirst({
      where: {
        tokenHash: this.hashToken(token),
        purpose: 'OWNER_ACTIVATION',
        status: 'PENDING',
      },
    })) as Invitation | null;
    this.assertUsable(invitation);

    const [principal, tenant, environment, policy, providers] =
      await Promise.all([
        this.prisma.principal.findUnique({
          where: { id: invitation.invitedPrincipalId! },
        }) as Promise<Principal | null>,
        this.prisma.tenant.findUnique({
          where: { id: invitation.tenantId },
        }) as Promise<Tenant | null>,
        // Unauthenticated activation: the tenant comes from the verified
        // invitation token, and only that tenant's environment is read.
        runWithTenantScope(invitation.tenantId, () =>
          this.prisma.environment.findFirst({
            where: { tenantId: invitation.tenantId, status: 'ACTIVE' },
            orderBy: { createdAt: 'asc' },
          }),
        ) as Promise<Environment | null>,
        this.prisma.policyDocument.findUnique({
          where: { id: invitation.policyDocumentId! },
        }) as Promise<PolicyDocument | null>,
        this.prisma.identityProviderConfiguration.findMany({
          where: {
            tenantId: invitation.tenantId,
            name: 'ZoikoID',
            protocol: 'OIDC',
            status: 'ACTIVE',
          },
          orderBy: { createdAt: 'asc' },
        }) as unknown as Promise<IdentityProviderConfiguration[]>,
      ]);

    if (!principal || !tenant || !environment || !policy) {
      throw new NotFoundException('Owner invitation context is incomplete');
    }
    if (tenant.status !== 'PROVISIONING') {
      throw new ConflictException('Tenant is not awaiting owner activation');
    }
    if (
      principal.status !== 'ACTIVE' ||
      principal.email?.toLowerCase() !== invitation.invitedEmail.toLowerCase()
    ) {
      throw new ConflictException('Invited owner identity is no longer valid');
    }
    if (!policy.active) {
      throw new ConflictException(
        'The access disclosure has changed; request a new owner invitation',
      );
    }
    if (providers.length === 0) {
      throw new ConflictException(
        'No active ZoikoID configuration is available for this tenant',
      );
    }

    return { invitation, principal, tenant, environment, policy, providers };
  }

  private assertUsable(
    invitation: Invitation | null,
  ): asserts invitation is Invitation {
    if (!invitation) {
      throw new NotFoundException(
        'Owner invitation was not found or has already been used',
      );
    }
    if (!invitation.invitedPrincipalId || !invitation.policyDocumentId) {
      throw new NotFoundException('Owner invitation is invalid');
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
      throw new GoneException('Owner invitation has expired');
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '***';
    const visible = local.slice(0, Math.min(2, local.length));
    return `${visible}${'*'.repeat(Math.max(3, local.length - visible.length))}@${domain}`;
  }
}
