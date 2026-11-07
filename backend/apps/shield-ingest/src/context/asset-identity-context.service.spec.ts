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
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      assetAlias: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'new-alias' }),
        update: jest.fn(),
      },
      identityEntity: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      identityAlias: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'new-alias' }),
        update: jest.fn(),
      },
      connectorInstance: {
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

  describe('resolveAsset', () => {
    it('creates a new asset and its first alias when nothing matches', async () => {
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
        sourceSystem: 'aws-cloudtrail',
        sourceAccountId: 'conn-1',
      });

      expect(result.id).toBe('asset-1');
      expect(prismaMock.asset.create).toHaveBeenCalled();
      expect(prismaMock.assetAlias.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            asset_id: 'asset-1',
            tenant_id: 'tenant-1',
            source_system: 'aws-cloudtrail',
            source_account_id: 'conn-1',
            external_type: 'EXTERNAL_ID',
            external_id: '192.168.1.1',
          }),
        }),
      );
    });

    it('matches on an existing alias without touching the bare lookup or creating anything', async () => {
      prismaMock.assetAlias.findFirst.mockResolvedValue({
        id: 'alias-1',
        asset_id: 'asset-1',
      });
      prismaMock.asset.update.mockResolvedValue({ id: 'asset-1' });

      const result = await service.resolveAsset({
        tenantId: 'tenant-1',
        environmentId: 'env-1',
        externalId: '192.168.1.1',
        assetType: 'IP',
        sourceSystem: 'aws-cloudtrail',
        sourceAccountId: 'conn-1',
      });

      expect(result.id).toBe('asset-1');
      expect(prismaMock.asset.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.asset.create).not.toHaveBeenCalled();
      expect(prismaMock.assetAlias.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'alias-1' } }),
      );
    });

    it('backfills an alias onto a pre-existing asset found only by the bare (tenant, externalId, assetType) match', async () => {
      // Simulates an asset created by core's manual "Add asset" before this
      // fix existed, or by a caller that supplied no source info.
      prismaMock.asset.findFirst.mockResolvedValue({
        id: 'asset-1',
        tenant_id: 'tenant-1',
        name: '192.168.1.1',
      });
      prismaMock.asset.update.mockResolvedValue({ id: 'asset-1' });

      const result = await service.resolveAsset({
        tenantId: 'tenant-1',
        environmentId: 'env-1',
        externalId: '192.168.1.1',
        assetType: 'IP',
        sourceSystem: 'aws-cloudtrail',
        sourceAccountId: 'conn-1',
      });

      expect(result.id).toBe('asset-1');
      expect(prismaMock.asset.create).not.toHaveBeenCalled();
      expect(prismaMock.assetAlias.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ asset_id: 'asset-1', source_system: 'aws-cloudtrail' }),
        }),
      );
      expect(prismaMock.asset.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'asset-1' } }),
      );
    });

    it('does not fail the resolve when two concurrent calls race to backfill the same alias', async () => {
      prismaMock.asset.findFirst.mockResolvedValue({ id: 'asset-1', tenant_id: 'tenant-1' });
      prismaMock.asset.update.mockResolvedValue({ id: 'asset-1' });
      prismaMock.assetAlias.create.mockRejectedValue({ code: 'P2002' });

      const result = await service.resolveAsset({
        tenantId: 'tenant-1',
        environmentId: 'env-1',
        externalId: '192.168.1.1',
        assetType: 'IP',
        sourceSystem: 'aws-cloudtrail',
        sourceAccountId: 'conn-1',
      });

      expect(result.id).toBe('asset-1');
    });

    it('does not swallow a genuine alias-write failure behind the race-tolerance catch', async () => {
      prismaMock.asset.findFirst.mockResolvedValue({ id: 'asset-1', tenant_id: 'tenant-1' });
      prismaMock.assetAlias.create.mockRejectedValue(new Error('connection refused'));

      await expect(
        service.resolveAsset({
          tenantId: 'tenant-1',
          environmentId: 'env-1',
          externalId: '192.168.1.1',
          assetType: 'IP',
        }),
      ).rejects.toThrow('connection refused');
    });

    it('defaults sourceSystem to UNKNOWN and sourceAccountId to null for a caller with no source info', async () => {
      prismaMock.asset.create.mockResolvedValue({ id: 'asset-1' });

      await service.resolveAsset({
        tenantId: 'tenant-1',
        environmentId: 'env-1',
        externalId: 'host-1',
        assetType: 'HOST',
      });

      expect(prismaMock.assetAlias.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ source_system: 'UNKNOWN', source_account_id: null }),
        }),
      );
    });
  });

  describe('resolveIdentity', () => {
    it('creates a new identity and its first alias when nothing matches', async () => {
      prismaMock.identityEntity.create.mockResolvedValue({
        id: 'id-1',
        tenant_id: 'tenant-1',
        email: 'user@example.com',
      });

      const result = await service.resolveIdentity({
        tenantId: 'tenant-1',
        email: 'User@Example.com',
        sourceSystem: 'okta',
        sourceAccountId: 'conn-2',
      });

      expect(result?.id).toBe('id-1');
      expect(prismaMock.identityEntity.create).toHaveBeenCalled();
      expect(prismaMock.identityAlias.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            identity_entity_id: 'id-1',
            source_system: 'okta',
            external_type: 'EMAIL',
            external_id: 'user@example.com',
          }),
        }),
      );
    });

    it('matches on an existing alias without a bare lookup', async () => {
      prismaMock.identityAlias.findFirst.mockResolvedValue({
        id: 'alias-1',
        identity_entity_id: 'id-1',
      });
      prismaMock.identityEntity.update.mockResolvedValue({ id: 'id-1' });

      const result = await service.resolveIdentity({
        tenantId: 'tenant-1',
        email: 'user@example.com',
        sourceSystem: 'okta',
        sourceAccountId: 'conn-2',
      });

      expect(result?.id).toBe('id-1');
      expect(prismaMock.identityEntity.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.identityEntity.create).not.toHaveBeenCalled();
    });

    it('backfills an alias onto a pre-existing identity found only by email', async () => {
      prismaMock.identityEntity.findFirst.mockResolvedValue({ id: 'id-1', tenant_id: 'tenant-1' });
      prismaMock.identityEntity.update.mockResolvedValue({ id: 'id-1' });

      const result = await service.resolveIdentity({
        tenantId: 'tenant-1',
        email: 'user@example.com',
        sourceSystem: 'okta',
        sourceAccountId: 'conn-2',
      });

      expect(result?.id).toBe('id-1');
      expect(prismaMock.identityEntity.create).not.toHaveBeenCalled();
      expect(prismaMock.identityAlias.create).toHaveBeenCalled();
    });

    it('returns null without querying anything when neither email nor externalId is given', async () => {
      const result = await service.resolveIdentity({ tenantId: 'tenant-1' });
      expect(result).toBeNull();
      expect(prismaMock.identityAlias.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('processNormalizedEventContext', () => {
    it('resolves the connector provider and passes it as the alias sourceSystem', async () => {
      prismaMock.normalizedEvent.findUnique.mockResolvedValue({
        id: 'evt-1',
        tenant_id: 'tenant-1',
        environment_id: 'env-1',
        connector_id: 'conn-1',
        resource_id: 'i-0abc123',
        resource_type: 'CLOUD_RESOURCE',
        actor_email: 'alice@example.com',
      });
      prismaMock.connectorInstance.findUnique.mockResolvedValue({
        definition: { provider: 'aws-cloudtrail' },
      });
      prismaMock.asset.create.mockResolvedValue({ id: 'asset-1' });
      prismaMock.identityEntity.create.mockResolvedValue({ id: 'id-1' });

      await service.processNormalizedEventContext('evt-1');

      expect(prismaMock.connectorInstance.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'conn-1' } }),
      );
      expect(prismaMock.assetAlias.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ source_system: 'aws-cloudtrail', source_account_id: 'conn-1' }),
        }),
      );
      expect(prismaMock.identityAlias.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ source_system: 'aws-cloudtrail', source_account_id: 'conn-1' }),
        }),
      );
    });

    it('falls back to UNKNOWN and still resolves context when the connector lookup fails (deleted connector, etc.)', async () => {
      prismaMock.normalizedEvent.findUnique.mockResolvedValue({
        id: 'evt-1',
        tenant_id: 'tenant-1',
        environment_id: 'env-1',
        connector_id: 'conn-deleted',
        resource_id: 'i-0abc123',
        resource_type: 'CLOUD_RESOURCE',
      });
      prismaMock.connectorInstance.findUnique.mockRejectedValue(new Error('not found'));
      prismaMock.asset.create.mockResolvedValue({ id: 'asset-1' });

      const result = await service.processNormalizedEventContext('evt-1');

      expect(result.assetId).toBe('asset-1');
      expect(prismaMock.assetAlias.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ source_system: 'UNKNOWN' }) }),
      );
    });

    it('throws NotFoundException for an event that does not exist', async () => {
      prismaMock.normalizedEvent.findUnique.mockResolvedValue(null);
      await expect(
        service.processNormalizedEventContext('missing'),
      ).rejects.toThrow(NotFoundException);
    });
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
