import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConnectorCatalogService } from './connector-catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectorRegistry } from './core/connector-registry';
import { ConnectorSyncService } from './services/sync.service';
import {
  ShieldCoreClient,
  ShieldCoreUnreachableError,
  TenantNotFoundError,
} from '../internal-client/shield-core.client';

describe('ConnectorCatalogService data-residency enforcement', () => {
  let service: ConnectorCatalogService;
  let prismaMock: any;
  let shieldCoreMock: any;

  const baseDto = {
    tenantId: 'tenant-1',
    name: 'Prod CloudTrail',
    provider: 'aws-cloudtrail',
    environmentId: 'env-1',
    sourceRegion: 'eu-west-1',
  };

  beforeEach(async () => {
    prismaMock = {
      connectorDefinition: {
        findUnique: jest.fn().mockResolvedValue({ id: 'def-1' }),
        create: jest.fn().mockResolvedValue({ id: 'def-1' }),
      },
      connectorInstance: {
        create: jest.fn().mockResolvedValue({ id: 'conn-1' }),
      },
      connectorCredentialReference: { create: jest.fn() },
    };
    shieldCoreMock = {
      getTenantResidency: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        homeRegion: 'eu-west-1',
        dataResidencyRegion: 'eu-west-1',
        status: 'ACTIVE',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectorCatalogService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConnectorRegistry, useValue: {} },
        { provide: ConnectorSyncService, useValue: {} },
        { provide: ShieldCoreClient, useValue: shieldCoreMock },
      ],
    }).compile();

    service = module.get<ConnectorCatalogService>(ConnectorCatalogService);
  });

  it('creates the connector when sourceRegion matches the committed residency region', async () => {
    const connector = await service.createConnector(baseDto as any);

    expect(connector).toEqual({ id: 'conn-1' });
    expect(shieldCoreMock.getTenantResidency).toHaveBeenCalledWith('tenant-1');
    expect(prismaMock.connectorInstance.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source_region: 'eu-west-1' }),
      }),
    );
  });

  it('rejects a sourceRegion outside the tenant committed residency region', async () => {
    await expect(
      service.createConnector({ ...baseDto, sourceRegion: 'us-east-1' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prismaMock.connectorInstance.create).not.toHaveBeenCalled();
  });

  it('fails closed when shield-core cannot confirm residency', async () => {
    shieldCoreMock.getTenantResidency.mockRejectedValue(
      new ShieldCoreUnreachableError('down'),
    );

    await expect(
      service.createConnector(baseDto as any),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(prismaMock.connectorInstance.create).not.toHaveBeenCalled();
  });

  it('rejects a connector for a tenant shield-core does not know', async () => {
    shieldCoreMock.getTenantResidency.mockRejectedValue(
      new TenantNotFoundError('no tenant'),
    );

    await expect(
      service.createConnector(baseDto as any),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prismaMock.connectorInstance.create).not.toHaveBeenCalled();
  });
});
