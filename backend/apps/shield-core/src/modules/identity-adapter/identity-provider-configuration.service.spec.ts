import { IdentityProviderConfigurationService } from './identity-provider-configuration.service';

describe('IdentityProviderConfigurationService', () => {
  it('creates federation trust as DRAFT and never returns secret references', async () => {
    const providers = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => ({
        id: 'provider-1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        ...value,
      })),
      save: jest.fn(async (value) => value),
    };
    const runtime = {
      assertApprovedExternalUrl: jest.fn(),
      callbackUrl: jest
        .fn()
        .mockReturnValue('https://shield.example.com/auth/sso/oidc/callback'),
    };
    const events = { record: jest.fn().mockResolvedValue(undefined) };
    const eventRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        await events.record(value);
        return value;
      }),
    };
    const dataSource = {
      transaction: jest.fn(async (work) =>
        work({
          getRepository: jest.fn((entity) =>
            entity.name === 'IdentityProviderConfiguration'
              ? providers
              : eventRepository,
          ),
        }),
      ),
    };
    const service = new IdentityProviderConfigurationService(
      dataSource as any,
      providers as any,
      {
        findOne: jest
          .fn()
          .mockResolvedValue({ id: 'tenant-1', status: 'ACTIVE' }),
      } as any,
      {
        findOne: jest.fn().mockResolvedValue({
          id: 'environment-1',
          tenantId: 'tenant-1',
          status: 'ACTIVE',
        }),
      } as any,
      {} as any,
      {} as any,
      runtime as any,
    );

    const result = await service.create(
      'tenant-1',
      {
        name: 'Company Entra ID',
        protocol: 'OIDC',
        environmentId: 'environment-1',
        issuer: 'https://login.example.com/company/v2.0',
        clientId: 'client-id',
        clientSecretRef: 'ACME_OIDC_CLIENT_SECRET',
      },
      'admin-1',
    );

    expect(result).toMatchObject({
      id: 'provider-1',
      status: 'DRAFT',
      protocol: 'OIDC',
      hasClientSecretRef: true,
      callbackUrl: 'https://shield.example.com/auth/sso/oidc/callback',
    });
    expect(result).not.toHaveProperty('clientSecretRef');
    expect(JSON.stringify(result)).not.toContain('ACME_OIDC_CLIENT_SECRET');
    expect(events.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'identity_provider_configuration_created',
        actorId: 'admin-1',
        tenantId: 'tenant-1',
      }),
    );
  });
});
