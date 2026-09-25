import { ForbiddenException } from '@nestjs/common';
import type {
  Invitation,
  LegalEntity,
  Tenant,
  TenantMembership,
} from '@prisma/client';
import type { Environment } from '../environment/environment.entity';
import type { IdentityEvent } from './identity-event.entity';
import { OwnerFederatedActivationService } from './owner-federated-activation.service';
import type { PolicyDocument } from './policy-document.entity';
import type { Principal } from './principal.entity';

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
      fullName: null,
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

    // Row stand-ins: `update` applies the patch to the fixture object, so the
    // assertions below observe exactly what the transaction wrote.
    const row = (value: object | null) => ({
      findUnique: jest.fn().mockResolvedValue(value),
      findFirst: jest.fn().mockResolvedValue(value),
      update: jest.fn(async ({ data }) => Object.assign(value!, data)),
    });
    const recordEvents = async ({ data }: { data: any }) => {
      events.push(...(Array.isArray(data) ? data : [data]));
      return data;
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'locked-row' }]),
      $executeRaw: jest.fn().mockResolvedValue(1),
      invitation: row(invitation),
      principal: row(principal),
      tenant: row(tenant),
      tenantMembership: {
        ...row(membership),
        findUnique: jest.fn().mockResolvedValue({
          ...membership,
          roles: [
            {
              membership_id: 'membership-1',
              role_id: 'role-owner',
              role: { id: 'role-owner' },
            },
          ],
        }),
      },
      policyDocument: row(policy),
      environment: row(environment),
      legalEntity: row(legalEntity),
      externalIdentity: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }) => ({ id: 'external-1', ...data })),
        update: jest.fn(),
      },
      policyAcceptance: {
        create: jest.fn(async ({ data }) => ({ id: 'acceptance-1', ...data })),
      },
      identityEvent: {
        create: jest.fn(recordEvents),
        createMany: jest.fn(recordEvents),
      },
    };
    const prisma = {
      ...tx,
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const evidence = {
      createEvidence: jest.fn().mockResolvedValue({ id: 'evidence-1' }),
    };
    const service = new OwnerFederatedActivationService(
      prisma as any,
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
      tx,
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
    // Tenant-owned reads in the activation transaction run in the invited
    // tenant's row-level-security scope.
    const scoped = test.tx.$executeRaw.mock.calls.find(([sql]: [string[]]) =>
      sql.join('?').includes("set_config('app.tenant_id'"),
    );
    expect(scoped?.slice(1)).toEqual([test.tenant.id]);
    expect(test.tenant.onboardingCompletedAt).toBeInstanceOf(Date);
    // Every row the activation mutates is locked first, and the reserved
    // "authorization" schema is quoted in the lock statements.
    const lockSql = test.tx.$queryRaw.mock.calls.map((call: any[]) =>
      (call[0] as string[]).join('?'),
    );
    expect(lockSql).toHaveLength(5);
    lockSql.forEach((sql: string) => expect(sql).toMatch(/FOR UPDATE/));
    expect(lockSql.join('\n')).toContain('"authorization".invitations');
    expect(lockSql.join('\n')).toContain('"authorization".tenant_memberships');
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
