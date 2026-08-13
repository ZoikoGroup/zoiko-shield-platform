import { Test, TestingModule } from '@nestjs/testing';
import { AssetResolutionService } from './asset-resolution.service';
import { AssetRepository } from './asset.repository';

describe('AssetResolutionService', () => {
  let service: AssetResolutionService;
  let repoMock: any;

  beforeEach(async () => {
    repoMock = {
      findAliasByKey: jest.fn(),
      touchAlias: jest.fn().mockResolvedValue(undefined),
      touchAsset: jest.fn().mockResolvedValue(undefined),
      createAsset: jest.fn(),
      createAlias: jest.fn().mockResolvedValue(undefined),
      recordDecision: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetResolutionService,
        { provide: AssetRepository, useValue: repoMock },
      ],
    }).compile();

    service = module.get<AssetResolutionService>(AssetResolutionService);
  });

  it('resolves via an existing alias instead of creating a duplicate asset', async () => {
    repoMock.findAliasByKey.mockResolvedValue({
      id: 'alias-1',
      asset_id: 'asset-1',
    });

    const result = await service.resolve({
      tenantId: 'tenant-a',
      environmentId: 'env-1',
      sourceSystem: 'microsoft-entra',
      sourceAccountId: 'conn-1',
      externalType: 'IP_ADDRESS',
      externalId: '203.0.113.5',
      assetType: 'IP',
    });

    expect(result).toEqual({ assetId: 'asset-1', decision: 'MATCHED' });
    expect(repoMock.createAsset).not.toHaveBeenCalled();
  });

  it('creates a new asset when two different aliases share the same hostname (spec §11 — no hostname-only merge)', async () => {
    repoMock.findAliasByKey
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    repoMock.createAsset
      .mockResolvedValueOnce({ id: 'asset-crowdstrike' })
      .mockResolvedValueOnce({ id: 'asset-entra' });

    const first = await service.resolve({
      tenantId: 'tenant-a',
      environmentId: 'env-1',
      sourceSystem: 'crowdstrike',
      sourceAccountId: 'conn-cs',
      externalType: 'DEVICE_ID',
      externalId: 'device-abc',
      assetType: 'ENDPOINT',
      hostname: 'finance-laptop-21',
    });
    const second = await service.resolve({
      tenantId: 'tenant-a',
      environmentId: 'env-1',
      sourceSystem: 'microsoft-entra',
      sourceAccountId: 'conn-entra',
      externalType: 'DEVICE_ID',
      externalId: 'device-xyz',
      assetType: 'ENDPOINT',
      hostname: 'finance-laptop-21',
    });

    expect(first.assetId).not.toBe(second.assetId);
    expect(repoMock.createAsset).toHaveBeenCalledTimes(2);
  });

  it('scopes the alias lookup by tenant, blocking cross-tenant resolution', async () => {
    repoMock.findAliasByKey.mockResolvedValue(null);
    repoMock.createAsset.mockResolvedValue({ id: 'asset-1' });

    await service.resolve({
      tenantId: 'tenant-b',
      environmentId: 'env-1',
      sourceSystem: 'crowdstrike',
      sourceAccountId: 'conn-1',
      externalType: 'DEVICE_ID',
      externalId: 'device-abc',
      assetType: 'ENDPOINT',
    });

    expect(repoMock.findAliasByKey).toHaveBeenCalledWith(
      'tenant-b',
      'crowdstrike',
      'conn-1',
      'DEVICE_ID',
      'device-abc',
    );
  });
});
