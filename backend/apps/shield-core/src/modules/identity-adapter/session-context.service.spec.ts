import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionContextService } from './session-context.service';

describe('SessionContextService', () => {
  const membership = {
    id: 'membership-1',
    tenantId: 'tenant-1',
    principalId: 'principal-1',
    status: 'ACTIVE',
    roles: [{ id: 'role-1', permissions: [] }],
  };
  const tenant = { id: 'tenant-1', status: 'ACTIVE' };
  const environment = {
    id: 'environment-1',
    tenantId: 'tenant-1',
    status: 'ACTIVE',
    region: 'eu-west-2',
  };

  function service(overrides?: {
    membership?: object | null;
    tenant?: object | null;
    environment?: object | null;
    policyVersion?: string;
  }) {
    return new SessionContextService(
      {
        findOne: jest
          .fn()
          .mockResolvedValue(
            overrides && 'membership' in overrides
              ? overrides.membership
              : membership,
          ),
      } as any,
      {
        findOne: jest
          .fn()
          .mockResolvedValue(
            overrides && 'tenant' in overrides ? overrides.tenant : tenant,
          ),
      } as any,
      {
        findOne: jest
          .fn()
          .mockResolvedValue(
            overrides && 'environment' in overrides
              ? overrides.environment
              : environment,
          ),
      } as any,
      new ConfigService({
        IAM_POLICY_VERSION: overrides?.policyVersion ?? 'iam-policy-2.0.0',
      }),
    );
  }

  it('binds a session only after exact active membership, role, tenant and environment checks', async () => {
    await expect(
      service().resolveBinding({
        principalId: 'principal-1',
        tenantId: 'tenant-1',
        environmentId: 'environment-1',
        authenticationMethod: 'OIDC',
        issuer: 'https://idp.example.com',
        riskState: 'NORMAL',
      }),
    ).resolves.toEqual({
      tenantId: 'tenant-1',
      membershipId: 'membership-1',
      environmentId: 'environment-1',
      region: 'eu-west-2',
      authenticationMethod: 'OIDC',
      issuer: 'https://idp.example.com',
      policyVersion: 'iam-policy-2.0.0',
      riskState: 'NORMAL',
      state: 'ACTIVE',
    });
  });

  it('denies identity-provider authentication when active membership is absent', async () => {
    await expect(
      service({ membership: null }).resolveBinding({
        principalId: 'principal-1',
        tenantId: 'tenant-1',
        environmentId: 'environment-1',
        authenticationMethod: 'SAML',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('invalidates an existing session when its policy binding is stale', async () => {
    await expect(
      service().assertSessionStillAuthorized({
        principalId: 'principal-1',
        tenantId: 'tenant-1',
        membershipId: 'membership-1',
        environmentId: 'environment-1',
        policyVersion: 'iam-policy-1.0.0',
        state: 'ACTIVE',
      } as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
