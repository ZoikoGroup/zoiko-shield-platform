import { Test, TestingModule } from '@nestjs/testing';
import { AssetIdentityContextService } from './asset-identity-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('AssetIdentityContextService', () => {
  let service: AssetIdentityContextService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      asset: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      identityEntity: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      normalizedEvent: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetIdentityContextService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<AssetIdentityContextService>(
      AssetIdentityContextService,
    );
  });

  it('should create new asset if it does not exist', async () => {
    prismaMock.asset.findFirst.mockResolvedValue(null);
    prismaMock.asset.create.mockResolvedValue({
      id: 'asset-1',
      tenant_id: 'tenant-1',
      external_id: '192.168.1.1',
      asset_type: 'IP',
      name: '192.168.1.1',
    });

    const result = await service.resolveAsset({
      tenantId: 'tenant-1',
      environmentId: 'env-1',
      externalId: '192.168.1.1',
      assetType: 'IP',
    });

    expect(result.id).toBe('asset-1');
    expect(prismaMock.asset.create).toHaveBeenCalled();
  });

  it('should update last_seen_at for existing asset without creating duplicate', async () => {
    const existingAsset = {
      id: 'asset-1',
      tenant_id: 'tenant-1',
      name: '192.168.1.1',
    };
    prismaMock.asset.findFirst.mockResolvedValue(existingAsset);
    prismaMock.asset.update.mockResolvedValue({
      ...existingAsset,
      last_seen_at: new Date(),
    });

    const result = await service.resolveAsset({
      tenantId: 'tenant-1',
      environmentId: 'env-1',
      externalId: '192.168.1.1',
      assetType: 'IP',
    });

    expect(result.id).toBe('asset-1');
    expect(prismaMock.asset.update).toHaveBeenCalled();
    expect(prismaMock.asset.create).not.toHaveBeenCalled();
  });

  it('should resolve identity entity by email', async () => {
    prismaMock.identityEntity.findFirst.mockResolvedValue(null);
    prismaMock.identityEntity.create.mockResolvedValue({
      id: 'id-1',
      tenant_id: 'tenant-1',
      email: 'user@example.com',
    });

    const result = await service.resolveIdentity({
      tenantId: 'tenant-1',
      email: 'User@Example.com',
    });

    expect(result?.id).toBe('id-1');
    expect(prismaMock.identityEntity.create).toHaveBeenCalled();
  });

  it('scopes asset detail lookup to the authenticated tenant', async () => {
    prismaMock.asset.findFirst.mockResolvedValue(null);

    await expect(
      service.getAssetById('tenant-a', 'asset-from-tenant-b'),
    ).rejects.toThrow(NotFoundException);
    expect(prismaMock.asset.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'asset-from-tenant-b', tenant_id: 'tenant-a' },
      }),
    );
  });
});
