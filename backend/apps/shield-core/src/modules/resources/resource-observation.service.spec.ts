import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { ProtectedResourceDefinitionService } from './protected-resource-definition.service';
import { ResourceCoverageService } from './resource-coverage.service';
import { ResourceObservationService } from './resource-observation.service';

describe('ResourceObservationService (Category C canonical discovery)', () => {
  let service: ResourceObservationService;
  let prismaMock: any;
  let definitionMock: any;
  let coverageMock: any;

  const definition = {
    id: 'def-1',
    version: 3,
    resource_family: 'ENDPOINT',
    metric_family: 'MDR_ENDPOINT',
    identity_key_spec: JSON.stringify({
      keys: ['deviceId'],
      physicalKeys: ['deviceId'],
    }),
  };

  beforeEach(async () => {
    prismaMock = {
      $transaction: jest.fn(async (callback: (tx: any) => unknown) =>
        callback(prismaMock),
      ),
      resourceObservation: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      resourceObservationWindow: { create: jest.fn() },
      resourceCoverageDecision: { create: jest.fn() },
    };
    definitionMock = { getActiveDefinition: jest.fn() };
    coverageMock = { routeDiscoveredObservation: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceObservationService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: ProtectedResourceDefinitionService,
          useValue: definitionMock,
        },
        { provide: ResourceCoverageService, useValue: coverageMock },
      ],
    }).compile();
    service = module.get(ResourceObservationService);
  });

  it('fails closed when there is no complete approved resource definition', async () => {
    definitionMock.getActiveDefinition.mockResolvedValue(null);

    await expect(
      service.recordObservation({
        tenantId: 'tenant-1',
        environmentId: 'env-1',
        resourceType: 'WINDOWS_DEVICE',
        sourceConnectorId: 'crowdstrike',
        identityAttributes: { deviceId: 'device-1' },
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects an observation missing an approved identity key instead of creating a collision', async () => {
    definitionMock.getActiveDefinition.mockResolvedValue(definition);

    await expect(
      service.recordObservation({
        tenantId: 'tenant-1',
        environmentId: 'env-1',
        resourceType: 'WINDOWS_DEVICE',
        sourceConnectorId: 'crowdstrike',
        identityAttributes: {},
      }),
    ).rejects.toThrow("Approved identity attribute 'deviceId'");
  });

  it('creates DISCOVERED/NON_BILLABLE with a retained source window, then routes only to review', async () => {
    definitionMock.getActiveDefinition.mockResolvedValue(definition);
    prismaMock.resourceObservation.findUnique.mockResolvedValue(null);
    prismaMock.resourceObservation.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'obs-1', ...data }),
    );
    coverageMock.routeDiscoveredObservation.mockImplementation(
      (observation: any) =>
        Promise.resolve({
          observation: {
            ...observation,
            coverage_state: 'REVIEW_REQUIRED',
            billable_state: 'NON_BILLABLE',
          },
          notice: null,
        }),
    );

    const result = await service.recordObservation({
      tenantId: 'tenant-1',
      environmentId: 'env-1',
      resourceType: 'WINDOWS_DEVICE',
      sourceConnectorId: 'crowdstrike',
      identityAttributes: { deviceId: 'DEVICE-1' },
      observedFrom: new Date('2026-08-01T00:00:00Z'),
      observedTo: new Date('2026-08-01T01:00:00Z'),
    });

    expect(result.deduped).toBe(false);
    expect(result.observation.billable_state).toBe('NON_BILLABLE');
    expect(prismaMock.resourceObservation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          coverage_state: 'DISCOVERED',
          billable_state: 'NON_BILLABLE',
          metric_family: 'MDR_ENDPOINT',
          resource_definition_id: 'def-1',
        }),
      }),
    );
    expect(prismaMock.resourceObservationWindow.create).toHaveBeenCalled();
    expect(coverageMock.routeDiscoveredObservation).toHaveBeenCalled();
  });

  it('deduplicates connector aliases to one canonical ID per metric family and appends a source window', async () => {
    definitionMock.getActiveDefinition.mockResolvedValue(definition);
    prismaMock.resourceObservation.findUnique.mockResolvedValue({
      id: 'obs-1',
      source_connectors: JSON.stringify(['crowdstrike']),
    });
    prismaMock.resourceObservation.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'obs-1', ...data }),
    );

    const result = await service.recordObservation({
      tenantId: 'tenant-1',
      environmentId: 'env-1',
      resourceType: 'WINDOWS_DEVICE',
      sourceConnectorId: 'microsoft-defender',
      identityAttributes: { deviceId: 'device-1' },
    });

    expect(result.deduped).toBe(true);
    expect(prismaMock.resourceObservation.create).not.toHaveBeenCalled();
    expect(prismaMock.resourceObservation.findUnique).toHaveBeenCalledWith({
      where: {
        tenant_id_metric_family_canonical_resource_id: {
          tenant_id: 'tenant-1',
          metric_family: 'MDR_ENDPOINT',
          canonical_resource_id: expect.any(String),
        },
      },
    });
    expect(prismaMock.resourceObservation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source_connectors: JSON.stringify([
            'crowdstrike',
            'microsoft-defender',
          ]),
        }),
      }),
    );
  });

  it("does not expose another tenant or environment's observation", async () => {
    prismaMock.resourceObservation.findFirst.mockResolvedValue(null);

    await expect(
      service.getObservationById('tenant-b', 'env-b', 'obs-1'),
    ).rejects.toThrow();
    expect(prismaMock.resourceObservation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'obs-1', tenant_id: 'tenant-b', environment_id: 'env-b' },
      }),
    );
  });
});
