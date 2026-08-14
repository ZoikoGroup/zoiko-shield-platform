import { ForbiddenException } from '@nestjs/common';
import { FederationAuthService } from './federation-auth.service';
import { ExternalIdentity } from './external-identity.entity';
import { Principal } from './principal.entity';
import { TenantMembership } from '../authorization/entities/tenant-membership.entity';

describe('FederationAuthService', () => {
  it('does not issue a session when the asserted identity lacks authoritative tenant membership', async () => {
    const externalRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'external-1',
        principalId: 'principal-1',
        issuer: 'https://idp.example.com',
        subject: 'subject-1',
      }),
      save: jest.fn(async (value) => value),
    };
    const principalRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'principal-1',
        status: 'ACTIVE',
        email: 'employee@example.com',
        riskState: 'NORMAL',
      }),
    };
    const membershipRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const dataSource = {
      getRepository: jest.fn((entity) => {
        if (entity === ExternalIdentity) return externalRepository;
        if (entity === Principal) return principalRepository;
        if (entity === TenantMembership) return membershipRepository;
        throw new Error(`Unexpected repository ${entity?.name}`);
      }),
    };
    const transactions = {
      consume: jest.fn().mockResolvedValue({
        transaction: {
          identityProviderConfigurationId: 'provider-1',
          tenantId: 'tenant-1',
          environmentId: 'environment-1',
          protocol: 'OIDC',
        },
        secrets: {
          nonce: 'nonce',
          pkceCodeVerifier: 'verifier',
          returnTo: '/',
        },
      }),
    };
    const provider = {
      id: 'provider-1',
      tenantId: 'tenant-1',
      environmentId: 'environment-1',
      protocol: 'OIDC',
    };
    const providers = { findActiveById: jest.fn().mockResolvedValue(provider) };
    const oidc = {
      validateCallback: jest.fn().mockResolvedValue({
        issuer: 'https://idp.example.com',
        subject: 'subject-1',
        email: 'employee@example.com',
        assurance: 'FEDERATED',
        claimProfile: { email: 'employee@example.com' },
      }),
    };
    const sessionContext = {
      resolveBinding: jest
        .fn()
        .mockRejectedValue(
          new ForbiddenException('ACTIVE_TENANT_MEMBERSHIP_REQUIRED'),
        ),
    };
    const auth = { issueFederatedSession: jest.fn() };
    const events = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new FederationAuthService(
      dataSource as any,
      {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((value) => value),
        save: jest.fn(async (value) => value),
      } as any,
      providers as any,
      transactions as any,
      oidc as any,
      {} as any,
      sessionContext as any,
      {} as any,
      auth as any,
      { applicationRedirect: jest.fn() } as any,
      events as any,
    );

    await expect(
      service.completeOidc(
        { state: 'state', code: 'code' },
        { ipAddress: '192.0.2.1' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(sessionContext.resolveBinding).toHaveBeenCalledWith(
      expect.objectContaining({
        principalId: 'principal-1',
        tenantId: 'tenant-1',
      }),
    );
    expect(auth.issueFederatedSession).not.toHaveBeenCalled();
    expect(events.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'federation_authentication_failed',
        tenantId: 'tenant-1',
      }),
    );
  });
});
