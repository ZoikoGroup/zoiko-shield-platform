import {
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';
import { Invitation } from '../authorization/entities/invitation.entity';
import { Environment } from '../environment/environment.entity';
import { FederationAuthService } from '../identity-adapter/federation-auth.service';
import { IdentityProviderConfiguration } from '../identity-adapter/identity-provider-configuration.entity';
import { PolicyDocument } from '../identity-adapter/policy-document.entity';
import { PolicyService } from '../identity-adapter/policy.service';
import { Principal } from '../identity-adapter/principal.entity';
import type { SessionMetadata } from '../identity-adapter/session.service';
import { Tenant } from '../tenant/tenant.entity';
import { StartOwnerActivationDto } from './dto/start-owner-activation.dto';

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
    @InjectDataSource() private readonly dataSource: DataSource,
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
    const invitation = await this.dataSource.getRepository(Invitation).findOne({
      where: {
        tokenHash: this.hashToken(token),
        purpose: 'OWNER_ACTIVATION',
        status: 'PENDING',
      },
    });
    this.assertUsable(invitation);

    const [principal, tenant, environment, policy, providers] =
      await Promise.all([
        this.dataSource
          .getRepository(Principal)
          .findOne({ where: { id: invitation.invitedPrincipalId! } }),
        this.dataSource
          .getRepository(Tenant)
          .findOne({ where: { id: invitation.tenantId } }),
        this.dataSource.getRepository(Environment).findOne({
          where: { tenantId: invitation.tenantId, status: 'ACTIVE' },
          order: { createdAt: 'ASC' },
        }),
        this.dataSource
          .getRepository(PolicyDocument)
          .findOne({ where: { id: invitation.policyDocumentId! } }),
        this.dataSource.getRepository(IdentityProviderConfiguration).find({
          where: {
            tenantId: invitation.tenantId,
            name: 'ZoikoID',
            protocol: 'OIDC',
            status: 'ACTIVE',
          },
          order: { createdAt: 'ASC' },
        }),
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
