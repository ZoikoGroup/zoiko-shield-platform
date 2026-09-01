import { ForbiddenException } from '@nestjs/common';
import { Invitation } from '../authorization/entities/invitation.entity';
import { TenantMembership } from '../authorization/entities/tenant-membership.entity';
import { Environment } from '../environment/environment.entity';
import { LegalEntity } from '../legal-entity/legal-entity.entity';
import { Tenant } from '../tenant/tenant.entity';
import { ExternalIdentity } from './external-identity.entity';
import { IdentityEvent } from './identity-event.entity';
import { OwnerFederatedActivationService } from './owner-federated-activation.service';
import { PolicyAcceptance } from './policy-acceptance.entity';
import { PolicyDocument } from './policy-document.entity';
import { Principal } from './principal.entity';

describe('OwnerFederatedActivationService', () => {
  function fixture(assertedEmail = 'owner@acme.example') {
    const invitation = {
      id: 'invitation-1',
      tokenHash: '',
      tenantId: 'tenant-1',
      invitedEmail: 'owner@acme.example',
      roleId: 'role-owner',
      purpose: 'OWNER_ACTIVATION',
      invitedPrincipalId: 'principal-1',
      policyDocumentId: 'policy-1',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60_000),
      acceptedAt: null,
      acceptedById: null,
    } as Invitation;
    const principal = {
      id: 'principal-1',
      status: 'ACTIVE',
      email: 'owner@acme.example',
      emailVerified: false,
      source: 'ONBOARDING',
      fullName: undefined,
      riskState: 'NORMAL',
    } as Principal;
    const tenant = {
      id: 'tenant-1',
      name: 'Acme',
      status: 'PROVISIONING',
      dataResidencyRegion: 'eu-west-1',
      dataClass: 'CONFIDENTIAL',
      retentionPolicyRef: 'seven-years',
      onboardingCompletedAt: null,
    } as Tenant;
    const membership = {
      id: 'membership-1',
      tenantId: 'tenant-1',
      principalId: 'principal-1',
      status: 'PENDING',
    } as TenantMembership;
    const policy = {
      id: 'policy-1',
      kind: 'ACCESS_DISCLOSURE',
      version: '1',
      contentHash: 'policy-hash',
      active: true,
    } as PolicyDocument;
    const environment = {
      id: 'environment-1',
      tenantId: 'tenant-1',
      name: 'Production',
      region: 'eu-west-1',
      status: 'ACTIVE',
    } as Environment;
    const legalEntity = {
      id: 'legal-entity-1',
      tenantId: 'tenant-1',
    } as LegalEntity;
    const events: IdentityEvent[] = [];

    const repositories = new Map<unknown, any>([
      [
        Invitation,
        {
          findOne: jest.fn().mockResolvedValue(invitation),
          save: jest.fn(async (value) => value),
        },
      ],
      [
        Principal,
        {
          findOne: jest.fn().mockResolvedValue(principal),
          save: jest.fn(async (value) => value),
        },
      ],
      [
        Tenant,
        {
          findOne: jest.fn().mockResolvedValue(tenant),
          save: jest.fn(async (value) => value),
        },
      ],
      [
        TenantMembership,
        {
          findOne: jest.fn().mockResolvedValue(membership),
          save: jest.fn(async (value) => value),
        },
      ],
      [PolicyDocument, { findOne: jest.fn().mockResolvedValue(policy) }],
      [Environment, { findOne: jest.fn().mockResolvedValue(environment) }],
      [LegalEntity, { findOne: jest.fn().mockResolvedValue(legalEntity) }],
      [
        ExternalIdentity,
        {
          findOne: jest.fn().mockResolvedValue(null),
          create: jest.fn((value) => value),
          save: jest.fn(async (value) => ({ id: 'external-1', ...value })),
        },
      ],
      [
        PolicyAcceptance,
        {
          create: jest.fn((value) => value),
          save: jest.fn(async (value) => ({ id: 'acceptance-1', ...value })),
        },
      ],
      [
        IdentityEvent,
        {
          create: jest.fn((value) => value),
          save: jest.fn(async (value) => {
            events.push(...(Array.isArray(value) ? value : [value]));
            return value;
          }),
        },
      ],
    ]);
    const manager = {
      getRepository: jest.fn((entity) => repositories.get(entity)),
      createQueryBuilder: jest.fn(() => ({
        relation: jest.fn().mockReturnThis(),
        of: jest.fn().mockReturnThis(),
        loadMany: jest.fn().mockResolvedValue([{ id: 'role-owner' }]),
      })),
    };
    const dataSource = {
      getRepository: manager.getRepository,
      transaction: jest.fn((callback) => callback(manager)),
    };
    const evidence = {
      createEvidence: jest.fn().mockResolvedValue({ id: 'evidence-1' }),
    };
    const service = new OwnerFederatedActivationService(
      dataSource as any,
      evidence as any,
    );
    const complete = () =>
      service.complete({
        providerConfigurationId: 'provider-1',
        tenantId: 'tenant-1',
        protocol: 'OIDC',
        assertion: {
          issuer: 'https://id.zoiko.example',
          subject: 'zoiko-subject-1',
          email: assertedEmail,
          fullName: 'Acme Owner',
          assurance: 'FEDERATED_MFA',
          claimProfile: {
            email: assertedEmail,
            emailVerified: true,
            amr: ['mfa'],
          },
        },
        invitationToken: 'single-use-token',
        consent: {
          accessDisclosureVersion: '1',
          accessDisclosureAcceptedAt: new Date().toISOString(),
          metadata: {
            ipAddress: '192.0.2.10',
            userAgent: 'test-browser',
          },
        },
      });

    return {
      complete,
      evidence,
      events,
      invitation,
      membership,
      principal,
      tenant,
    };
  }

  it('atomically activates the invited owner and tenant before recording evidence', async () => {
    const test = fixture();

    const result = await test.complete();

    expect(result.principal.id).toBe('principal-1');
    expect(test.principal.emailVerified).toBe(true);
    expect(test.membership.status).toBe('ACTIVE');
    expect(test.invitation.status).toBe('CONSUMED');
    expect(test.tenant.status).toBe('ACTIVE');
    expect(test.tenant.onboardingCompletedAt).toBeInstanceOf(Date);
    expect(test.evidence.createEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        sourceObjectId: 'acceptance-1',
        evidenceType: 'POLICY_ACCEPTANCE',
      }),
    );
    expect(test.events.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        'external_identity_linked',
        'owner_invitation_consumed',
        'tenant_onboarded',
        'policy_acceptance_evidence_recorded',
      ]),
    );
  });

  it('rejects a ZoikoID assertion for a different email without activating state', async () => {
    const test = fixture('attacker@example.net');

    await expect(test.complete()).rejects.toBeInstanceOf(ForbiddenException);
    expect(test.membership.status).toBe('PENDING');
    expect(test.invitation.status).toBe('PENDING');
    expect(test.tenant.status).toBe('PROVISIONING');
    expect(test.evidence.createEvidence).not.toHaveBeenCalled();
  });
});
