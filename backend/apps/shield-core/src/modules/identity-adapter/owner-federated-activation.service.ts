import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';
import { Invitation } from '../authorization/entities/invitation.entity';
import { Role } from '../authorization/entities/role.entity';
import { TenantMembership } from '../authorization/entities/tenant-membership.entity';
import { Environment } from '../environment/environment.entity';
import { EvidenceService } from '../evidence/services/evidence.service';
import { LegalEntity } from '../legal-entity/legal-entity.entity';
import { Tenant } from '../tenant/tenant.entity';
import { ExternalIdentity } from './external-identity.entity';
import { IdentityEvent } from './identity-event.entity';
import { FederationAssertion } from './interfaces/federation-assertion.interface';
import { PolicyAcceptance } from './policy-acceptance.entity';
import { PolicyDocument } from './policy-document.entity';
import { Principal } from './principal.entity';
import type { SessionMetadata } from './session.service';

type ActivationResult = {
  principal: Principal;
  externalIdentity: ExternalIdentity;
  invitation: Invitation;
  tenant: Tenant;
  environment: Environment;
  legalEntity: LegalEntity | null;
  policy: PolicyDocument;
  acceptance: PolicyAcceptance;
};

export type OwnerInvitationConsent = {
  accessDisclosureVersion?: string;
  accessDisclosureAcceptedAt?: string;
  metadata: SessionMetadata;
};

@Injectable()
export class OwnerFederatedActivationService {
  private readonly logger = new Logger(OwnerFederatedActivationService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly evidence: EvidenceService,
  ) {}

  async isOwnerInvitation(token: string, tenantId: string): Promise<boolean> {
    return Boolean(
      await this.dataSource.getRepository(Invitation).findOne({
        where: {
          tokenHash: this.hashToken(token),
          tenantId,
          purpose: 'OWNER_ACTIVATION',
        },
        select: { id: true },
      }),
    );
  }

  async complete(input: {
    providerConfigurationId: string;
    tenantId: string;
    protocol: 'OIDC' | 'SAML';
    assertion: FederationAssertion;
    invitationToken: string;
    consent: OwnerInvitationConsent;
  }): Promise<{ principal: Principal; externalIdentity: ExternalIdentity }> {
    if (
      input.protocol !== 'OIDC' ||
      input.assertion.claimProfile.emailVerified !== true
    ) {
      throw new ForbiddenException(
        'ZoikoID must assert a verified email before owner activation',
      );
    }
    const acceptedAt = this.acceptedAt(input.consent);
    let result: ActivationResult;
    try {
      result = await this.dataSource.transaction(async (manager) => {
        const invitations = manager.getRepository(Invitation);
        const invitation = await invitations.findOne({
          where: {
            tokenHash: this.hashToken(input.invitationToken),
            tenantId: input.tenantId,
            purpose: 'OWNER_ACTIVATION',
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (!invitation) {
          throw new NotFoundException('Owner invitation was not found');
        }
        if (invitation.status !== 'PENDING') {
          throw new ConflictException(
            'Owner invitation has already been used or revoked',
          );
        }
        if (invitation.expiresAt.getTime() <= Date.now()) {
          throw new GoneException('Owner invitation has expired');
        }
        if (
          !invitation.invitedPrincipalId ||
          !invitation.policyDocumentId ||
          invitation.invitedEmail.toLowerCase() !==
            input.assertion.email.trim().toLowerCase()
        ) {
          throw new ForbiddenException(
            'The verified ZoikoID identity does not match this owner invitation',
          );
        }

        const principalRepository = manager.getRepository(Principal);
        const principal = await principalRepository.findOne({
          where: { id: invitation.invitedPrincipalId },
          lock: { mode: 'pessimistic_write' },
        });
        if (
          !principal ||
          principal.status !== 'ACTIVE' ||
          principal.email?.toLowerCase() !==
            invitation.invitedEmail.toLowerCase()
        ) {
          throw new ForbiddenException(
            'The pre-provisioned owner principal is no longer active',
          );
        }

        const tenants = manager.getRepository(Tenant);
        const tenant = await tenants.findOne({
          where: { id: input.tenantId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!tenant || tenant.status !== 'PROVISIONING') {
          throw new ConflictException(
            'Tenant is not awaiting owner activation',
          );
        }

        const memberships = manager.getRepository(TenantMembership);
        const membership = await memberships.findOne({
          where: {
            tenantId: tenant.id,
            principalId: principal.id,
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (!membership || membership.status !== 'PENDING') {
          throw new ConflictException(
            'Pending tenant-owner membership is missing or has changed',
          );
        }
        const roles = await manager
          .createQueryBuilder()
          .relation(TenantMembership, 'roles')
          .of(membership)
          .loadMany<Role>();
        if (!roles.some((role) => role.id === invitation.roleId)) {
          throw new ConflictException(
            'The approved tenant-owner role is no longer assigned',
          );
        }

        const policy = await manager.getRepository(PolicyDocument).findOne({
          where: { id: invitation.policyDocumentId },
        });
        if (
          !policy ||
          !policy.active ||
          policy.version !== input.consent.accessDisclosureVersion
        ) {
          throw new ConflictException(
            'The access disclosure has changed; restart owner activation',
          );
        }

        const environment = await manager.getRepository(Environment).findOne({
          where: { tenantId: tenant.id, status: 'ACTIVE' },
          order: { createdAt: 'ASC' },
        });
        if (!environment) {
          throw new ConflictException('Tenant has no active environment');
        }

        const externalIdentities = manager.getRepository(ExternalIdentity);
        let externalIdentity = await externalIdentities.findOne({
          where: {
            issuer: input.assertion.issuer,
            subject: input.assertion.subject,
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (externalIdentity && externalIdentity.principalId !== principal.id) {
          throw new ForbiddenException(
            'This ZoikoID identity is already linked to another principal',
          );
        }
        if (!externalIdentity) {
          externalIdentity = externalIdentities.create({
            principalId: principal.id,
            issuer: input.assertion.issuer,
            subject: input.assertion.subject,
            provider: input.protocol,
            claimProfile: input.assertion.claimProfile,
            verificationState: 'VERIFIED',
            lastSyncedAt: new Date(),
          });
        } else {
          externalIdentity.claimProfile = input.assertion.claimProfile;
          externalIdentity.verificationState = 'VERIFIED';
          externalIdentity.lastSyncedAt = new Date();
        }
        externalIdentity = await externalIdentities.save(externalIdentity);

        principal.emailVerified = true;
        principal.source = input.protocol;
        principal.fullName ??= input.assertion.fullName;
        await principalRepository.save(principal);

        const acceptances = manager.getRepository(PolicyAcceptance);
        const acceptance = await acceptances.save(
          acceptances.create({
            principalId: principal.id,
            policyDocumentId: policy.id,
            ipAddress: input.consent.metadata.ipAddress,
            userAgent: input.consent.metadata.userAgent,
            acceptedAt,
          }),
        );

        membership.status = 'ACTIVE';
        await memberships.save(membership);

        invitation.status = 'CONSUMED';
        invitation.acceptedAt = acceptedAt;
        invitation.acceptedById = principal.id;
        await invitations.save(invitation);

        tenant.status = 'ACTIVE';
        tenant.onboardingCompletedAt = acceptedAt;
        await tenants.save(tenant);

        const events = manager.getRepository(IdentityEvent);
        await events.save([
          events.create({
            eventType: 'external_identity_linked',
            principalId: principal.id,
            actorId: principal.id,
            tenantId: tenant.id,
            data: {
              issuer: input.assertion.issuer,
              identityProviderConfigurationId: input.providerConfigurationId,
              linkingMethod: 'OWNER_INVITATION_ZOIKOID',
            },
          }),
          events.create({
            eventType: 'owner_invitation_consumed',
            principalId: principal.id,
            actorId: principal.id,
            tenantId: tenant.id,
            data: {
              invitationId: invitation.id,
              membershipId: membership.id,
              policyAcceptanceId: acceptance.id,
              accessDisclosureVersion: policy.version,
              evidenceStatus: 'PENDING_RETRY',
            },
          }),
          events.create({
            eventType: 'tenant_onboarded',
            principalId: principal.id,
            actorId: principal.id,
            tenantId: tenant.id,
            data: {
              environmentId: environment.id,
              accessDisclosureVersion: policy.version,
              authenticationMethod: input.protocol,
            },
          }),
        ]);

        const legalEntity = await manager.getRepository(LegalEntity).findOne({
          where: { tenantId: tenant.id },
          order: { createdAt: 'ASC' },
        });

        return {
          principal,
          externalIdentity,
          invitation,
          tenant,
          environment,
          legalEntity,
          policy,
          acceptance,
        };
      });
    } catch (error) {
      if (
        error instanceof Error &&
        /duplicate key|unique constraint/i.test(error.message)
      ) {
        throw new ConflictException(
          'ZoikoID identity was linked concurrently; restart owner activation',
        );
      }
      throw error;
    }

    await this.recordPolicyAcceptanceEvidence(result);
    return {
      principal: result.principal,
      externalIdentity: result.externalIdentity,
    };
  }

  private acceptedAt(consent: OwnerInvitationConsent): Date {
    if (
      !consent.accessDisclosureVersion ||
      !consent.accessDisclosureAcceptedAt
    ) {
      throw new ForbiddenException(
        'Access disclosure acceptance is required before ZoikoID authentication',
      );
    }
    const acceptedAt = new Date(consent.accessDisclosureAcceptedAt);
    if (
      Number.isNaN(acceptedAt.getTime()) ||
      acceptedAt.getTime() > Date.now()
    ) {
      throw new ForbiddenException('Access disclosure acceptance is invalid');
    }
    return acceptedAt;
  }

  private async recordPolicyAcceptanceEvidence(
    result: ActivationResult,
  ): Promise<void> {
    try {
      const evidence = await this.evidence.createEvidence({
        tenantId: result.tenant.id,
        environmentId: result.environment.id,
        legalEntityId: result.legalEntity?.id,
        region: result.tenant.dataResidencyRegion,
        evidenceType: 'POLICY_ACCEPTANCE',
        producingService: 'identity-adapter',
        sourceSystemId: 'zoikoid-owner-activation',
        sourceObjectId: result.acceptance.id,
        purpose: 'TENANT_OWNER_ACTIVATION',
        dataClass: result.tenant.dataClass,
        retentionProfile: result.tenant.retentionPolicyRef,
        content: {
          tenantId: result.tenant.id,
          principalId: result.principal.id,
          invitationId: result.invitation.id,
          policyAcceptanceId: result.acceptance.id,
          policyDocumentId: result.policy.id,
          policyVersion: result.policy.version,
          policyContentHash: result.policy.contentHash,
          acceptedAt: result.acceptance.acceptedAt.toISOString(),
        },
      });
      await this.dataSource.getRepository(IdentityEvent).save(
        this.dataSource.getRepository(IdentityEvent).create({
          eventType: 'policy_acceptance_evidence_recorded',
          principalId: result.principal.id,
          actorId: result.principal.id,
          tenantId: result.tenant.id,
          data: {
            invitationId: result.invitation.id,
            policyAcceptanceId: result.acceptance.id,
            evidenceId: evidence.id,
          },
        }),
      );
    } catch (error) {
      // Activation is already durably committed. The PENDING_RETRY identity
      // event is the recovery marker for an evidence retry worker.
      this.logger.error(
        `Owner activation succeeded but evidence creation requires retry for invitation ${result.invitation.id}: ${String(error)}`,
      );
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
