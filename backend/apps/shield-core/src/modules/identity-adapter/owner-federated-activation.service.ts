import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Invitation, LegalEntity, Prisma, Tenant } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { Environment } from '../environment/environment.entity';
import { EvidenceService } from '../evidence/services/evidence.service';
import type { ExternalIdentity } from './external-identity.entity';
import { FederationAssertion } from './interfaces/federation-assertion.interface';
import type { PolicyAcceptance } from './policy-acceptance.entity';
import type { PolicyDocument } from './policy-document.entity';
import type { Principal } from './principal.entity';
import type { SessionMetadata } from './session.service';
import { scopeTransactionToTenant } from '../../../../../libs/database/src';

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
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
  ) {}

  async isOwnerInvitation(token: string, tenantId: string): Promise<boolean> {
    return Boolean(
      await this.prisma.invitation.findFirst({
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
      result = await this.prisma.$transaction(async (tx) => {
        const tokenHash = this.hashToken(input.invitationToken);
        // Row locks (SELECT ... FOR UPDATE) serialise concurrent activations
        // of the same invitation, principal, tenant and membership.
        const [lockedInvitation] = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "authorization".invitations
          WHERE "tokenHash" = ${tokenHash}
            AND "tenantId" = ${input.tenantId}::uuid
            AND purpose = 'OWNER_ACTIVATION'
          LIMIT 1
          FOR UPDATE`;
        const invitation = lockedInvitation
          ? await tx.invitation.findUnique({
              where: { id: lockedInvitation.id },
            })
          : null;
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

        await tx.$queryRaw`
          SELECT id FROM identity.principals
          WHERE id = ${invitation.invitedPrincipalId}::uuid
          FOR UPDATE`;
        const principal = (await tx.principal.findUnique({
          where: { id: invitation.invitedPrincipalId },
        })) as Principal | null;
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

        await tx.$queryRaw`
          SELECT id FROM tenant.tenants
          WHERE id = ${input.tenantId}::uuid
          FOR UPDATE`;
        const tenant = await tx.tenant.findUnique({
          where: { id: input.tenantId },
        });
        if (!tenant || tenant.status !== 'PROVISIONING') {
          throw new ConflictException(
            'Tenant is not awaiting owner activation',
          );
        }

        await tx.$queryRaw`
          SELECT id FROM "authorization".tenant_memberships
          WHERE "tenantId" = ${tenant.id}::uuid
            AND "principalId" = ${principal.id}::uuid
          FOR UPDATE`;
        const membership = await tx.tenantMembership.findUnique({
          where: {
            tenantId_principalId: {
              tenantId: tenant.id,
              principalId: principal.id,
            },
          },
          include: { roles: { include: { role: true } } },
        });
        if (!membership || membership.status !== 'PENDING') {
          throw new ConflictException(
            'Pending tenant-owner membership is missing or has changed',
          );
        }
        const roles = membership.roles.map((assigned) => assigned.role);
        if (!roles.some((role) => role.id === invitation.roleId)) {
          throw new ConflictException(
            'The approved tenant-owner role is no longer assigned',
          );
        }

        const policy = await tx.policyDocument.findUnique({
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

        // The tenant is now locked and verified from the invitation: scope
        // the rest of this transaction's tenant-owned reads and writes to it.
        await scopeTransactionToTenant(tx, tenant.id);
        const environment = (await tx.environment.findFirst({
          where: { tenantId: tenant.id, status: 'ACTIVE' },
          orderBy: { createdAt: 'asc' },
        })) as Environment | null;
        if (!environment) {
          throw new ConflictException('Tenant has no active environment');
        }

        await tx.$queryRaw`
          SELECT id FROM identity.external_identities
          WHERE issuer = ${input.assertion.issuer}
            AND subject = ${input.assertion.subject}
          FOR UPDATE`;
        const existingIdentity = await tx.externalIdentity.findUnique({
          where: {
            issuer_subject: {
              issuer: input.assertion.issuer,
              subject: input.assertion.subject,
            },
          },
        });
        if (existingIdentity && existingIdentity.principalId !== principal.id) {
          throw new ForbiddenException(
            'This ZoikoID identity is already linked to another principal',
          );
        }
        const claimProfile = input.assertion
          .claimProfile as Prisma.InputJsonValue;
        const externalIdentity = (
          existingIdentity
            ? await tx.externalIdentity.update({
                where: { id: existingIdentity.id },
                data: {
                  claimProfile,
                  verificationState: 'VERIFIED',
                  lastSyncedAt: new Date(),
                },
              })
            : await tx.externalIdentity.create({
                data: {
                  principalId: principal.id,
                  issuer: input.assertion.issuer,
                  subject: input.assertion.subject,
                  provider: input.protocol,
                  claimProfile,
                  verificationState: 'VERIFIED',
                  lastSyncedAt: new Date(),
                },
              })
        ) as ExternalIdentity;

        const activatedPrincipal = (await tx.principal.update({
          where: { id: principal.id },
          data: {
            emailVerified: true,
            source: input.protocol,
            fullName: principal.fullName ?? input.assertion.fullName,
          },
        })) as Principal;

        const acceptance = await tx.policyAcceptance.create({
          data: {
            principalId: principal.id,
            policyDocumentId: policy.id,
            ipAddress: input.consent.metadata.ipAddress,
            userAgent: input.consent.metadata.userAgent,
            acceptedAt,
          },
        });

        await tx.tenantMembership.update({
          where: { id: membership.id },
          data: { status: 'ACTIVE' },
        });

        const consumedInvitation = await tx.invitation.update({
          where: { id: invitation.id },
          data: {
            status: 'CONSUMED',
            acceptedAt,
            acceptedById: principal.id,
          },
        });

        const activatedTenant = await tx.tenant.update({
          where: { id: tenant.id },
          data: { status: 'ACTIVE', onboardingCompletedAt: acceptedAt },
        });

        await tx.identityEvent.createMany({
          data: [
            {
              eventType: 'external_identity_linked',
              principalId: principal.id,
              actorId: principal.id,
              tenantId: tenant.id,
              data: {
                issuer: input.assertion.issuer,
                identityProviderConfigurationId: input.providerConfigurationId,
                linkingMethod: 'OWNER_INVITATION_ZOIKOID',
              },
            },
            {
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
            },
            {
              eventType: 'tenant_onboarded',
              principalId: principal.id,
              actorId: principal.id,
              tenantId: tenant.id,
              data: {
                environmentId: environment.id,
                accessDisclosureVersion: policy.version,
                authenticationMethod: input.protocol,
              },
            },
          ],
        });

        const legalEntity = await tx.legalEntity.findFirst({
          where: { tenantId: tenant.id },
          orderBy: { createdAt: 'asc' },
        });

        return {
          principal: activatedPrincipal,
          externalIdentity,
          invitation: consumedInvitation,
          tenant: activatedTenant,
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
      await this.prisma.identityEvent.create({
        data: {
          eventType: 'policy_acceptance_evidence_recorded',
          principalId: result.principal.id,
          actorId: result.principal.id,
          tenantId: result.tenant.id,
          data: {
            invitationId: result.invitation.id,
            policyAcceptanceId: result.acceptance.id,
            evidenceId: evidence.id,
          },
        },
      });
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
