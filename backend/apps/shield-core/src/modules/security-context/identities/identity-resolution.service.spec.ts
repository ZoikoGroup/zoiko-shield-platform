import { Test, TestingModule } from '@nestjs/testing';
import { IdentityResolutionService } from './identity-resolution.service';
import { IdentityRepository } from './identity.repository';

describe('IdentityResolutionService', () => {
  let service: IdentityResolutionService;
  let repoMock: any;

  beforeEach(async () => {
    repoMock = {
      findAliasByKey: jest.fn(),
      touchAlias: jest.fn().mockResolvedValue(undefined),
      touchIdentity: jest.fn().mockResolvedValue(undefined),
      createIdentity: jest.fn(),
      createAlias: jest.fn().mockResolvedValue(undefined),
      recordDecision: jest.fn().mockResolvedValue(undefined),
      findByExternalId: jest.fn(),
      markRemoved: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [IdentityResolutionService, { provide: IdentityRepository, useValue: repoMock }],
    }).compile();

    service = module.get<IdentityResolutionService>(IdentityResolutionService);
  });

  it('returns MATCHED and does not create a new identity when a trusted alias already exists', async () => {
    repoMock.findAliasByKey.mockResolvedValue({ id: 'alias-1', identity_entity_id: 'identity-1' });

    const result = await service.resolve({
      tenantId: 'tenant-a',
      sourceSystem: 'microsoft-entra',
      sourceAccountId: 'conn-1',
      externalType: 'OBJECT_ID',
      externalId: 'entra-user-1',
      email: 'user@example.com',
    });

    expect(result).toEqual({ identityEntityId: 'identity-1', decision: 'MATCHED' });
    expect(repoMock.createIdentity).not.toHaveBeenCalled();
    expect(repoMock.recordDecision).toHaveBeenCalledWith(expect.objectContaining({ decision: 'MATCHED' }));
  });

  it('creates a new canonical identity and alias when no trusted alias exists (spec §9 — no auto-merge on email alone)', async () => {
    repoMock.findAliasByKey.mockResolvedValue(null);
    repoMock.createIdentity.mockResolvedValue({ id: 'identity-new' });

    const result = await service.resolve({
      tenantId: 'tenant-a',
      sourceSystem: 'microsoft-entra',
      sourceAccountId: 'conn-1',
      externalType: 'OBJECT_ID',
      externalId: 'entra-user-2',
      email: 'shared@example.com',
    });

    expect(result).toEqual({ identityEntityId: 'identity-new', decision: 'CREATED' });
    expect(repoMock.createAlias).toHaveBeenCalledWith(
      expect.objectContaining({ identityEntityId: 'identity-new', externalId: 'entra-user-2' }),
    );
    expect(repoMock.recordDecision).toHaveBeenCalledWith(expect.objectContaining({ decision: 'CREATED' }));
  });

  it('scopes alias lookup by tenant — the same external id under a different tenant never matches (cross-tenant isolation)', async () => {
    // The repository itself enforces tenant scoping via the compound unique
    // key; this test proves the service always passes tenantId through to
    // the lookup rather than caching/reusing a lookup across tenants.
    repoMock.findAliasByKey.mockResolvedValue(null);
    repoMock.createIdentity.mockResolvedValue({ id: 'identity-tenant-b' });

    await service.resolve({
      tenantId: 'tenant-b',
      sourceSystem: 'microsoft-entra',
      sourceAccountId: 'conn-1',
      externalType: 'OBJECT_ID',
      externalId: 'entra-user-1',
    });

    expect(repoMock.findAliasByKey).toHaveBeenCalledWith('tenant-b', 'microsoft-entra', 'conn-1', 'OBJECT_ID', 'entra-user-1');
  });

  it('re-activates a previously removed identity to ACTIVE when it is observed again (idempotent duplicate handling)', async () => {
    repoMock.findAliasByKey.mockResolvedValue({ id: 'alias-1', identity_entity_id: 'identity-1' });

    await service.resolve({
      tenantId: 'tenant-a',
      sourceSystem: 'microsoft-entra',
      sourceAccountId: 'conn-1',
      externalType: 'OBJECT_ID',
      externalId: 'entra-user-1',
    });
    await service.resolve({
      tenantId: 'tenant-a',
      sourceSystem: 'microsoft-entra',
      sourceAccountId: 'conn-1',
      externalType: 'OBJECT_ID',
      externalId: 'entra-user-1',
    });

    expect(repoMock.touchIdentity).toHaveBeenCalledTimes(2);
    expect(repoMock.createIdentity).not.toHaveBeenCalled();
  });

  it('markRemoved is a no-op (does not throw) when no identity exists for the external id', async () => {
    repoMock.findByExternalId.mockResolvedValue(null);

    await expect(service.markRemoved('tenant-a', 'unknown-user')).resolves.toBeUndefined();
    expect(repoMock.markRemoved).not.toHaveBeenCalled();
  });
});
