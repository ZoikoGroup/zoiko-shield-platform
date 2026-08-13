import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { ResourceObservationService } from './resource-observation.service';
import { ProtectedResourceDefinitionService } from './protected-resource-definition.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ResourceObservationService (ZS-COM-BILL-001 Part 5/6 dedup engine)', () => {
  let service: ResourceObservationService;
  let prismaMock: any;
  let definitionMock: any;

  beforeEach(async () => {
    prismaMock = {
      resourceObservation: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    definitionMock = { getActiveDefinition: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceObservationService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: ProtectedResourceDefinitionService,
          useValue: definitionMock,
        },
      ],
    }).compile();

    service = module.get<ResourceObservationService>(
      ResourceObservationService,
    );
  });

  const definition = {
    identity_key_spec: JSON.stringify({ keys: ['externalId'] }),
  };

  it('fails closed when no approved resource definition exists for the type', async () => {
    definitionMock.getActiveDefinition.mockResolvedValue(null);

    await expect(
      service.recordObservation({
        tenantId: 't1',
        resourceType: 'ENDPOINT',
        sourceConnectorId: 'crowdstrike',
        identityAttributes: { externalId: 'abc' },
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('creates a new DISCOVERED / NON_BILLABLE observation on first sight', async () => {
    definitionMock.getActiveDefinition.mockResolvedValue(definition);
    prismaMock.resourceObservation.findUnique.mockResolvedValue(null);
    prismaMock.resourceObservation.create.mockResolvedValue({
      id: 'obs-1',
      coverage_state: 'DISCOVERED',
      billable_state: 'NON_BILLABLE',
    });

    const result = await service.recordObservation({
      tenantId: 't1',
      environmentId: 'env-1',
      resourceType: 'ENDPOINT',
      sourceConnectorId: 'crowdstrike',
      identityAttributes: { externalId: 'abc' },
    });

    expect(result.deduped).toBe(false);
    expect(result.observation.billable_state).toBe('NON_BILLABLE');
  });

  it('the same resource observed via a second connector deduplicates to the same canonical row, not a new one', async () => {
    definitionMock.getActiveDefinition.mockResolvedValue(definition);
    prismaMock.resourceObservation.findUnique.mockResolvedValue({
      id: 'obs-1',
      coverage_state: 'COVERED',
      billable_state: 'NON_BILLABLE',
    });
    prismaMock.resourceObservation.update.mockResolvedValue({
      id: 'obs-1',
      coverage_state: 'COVERED',
    });

    const result = await service.recordObservation({
      tenantId: 't1',
      resourceType: 'ENDPOINT',
      sourceConnectorId: 'microsoft-defender', // different connector, same identity
      identityAttributes: { externalId: 'abc' },
    });

    expect(result.deduped).toBe(true);
    expect(prismaMock.resourceObservation.create).not.toHaveBeenCalled();
    expect(prismaMock.resourceObservation.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'obs-1' } }),
    );
  });

  it('never allows billable_state=BILLABLE while coverage_state is not BILLABLE (Principle 3)', async () => {
    prismaMock.resourceObservation.findFirst.mockResolvedValue({
      id: 'obs-1',
      coverage_state: 'DISCOVERED',
    });
    prismaMock.resourceObservation.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'obs-1', ...data }),
    );

    const updated = await service.updateCoverageState(
      't1',
      'obs-1',
      'REVIEW_REQUIRED',
    );

    expect(updated.coverage_state).toBe('REVIEW_REQUIRED');
    expect(updated.billable_state).toBe('NON_BILLABLE');
  });

  it('rejects an illegal jump straight from DISCOVERED to BILLABLE', async () => {
    prismaMock.resourceObservation.findFirst.mockResolvedValue({
      id: 'obs-1',
      coverage_state: 'DISCOVERED',
    });

    await expect(
      service.updateCoverageState('t1', 'obs-1', 'BILLABLE'),
    ).rejects.toThrow(ConflictException);
  });

  it('sets billable_state=BILLABLE only on the BILLABLE coverage transition', async () => {
    prismaMock.resourceObservation.findFirst.mockResolvedValue({
      id: 'obs-1',
      coverage_state: 'COVERED',
    });
    prismaMock.resourceObservation.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'obs-1', ...data }),
    );

    const updated = await service.updateCoverageState(
      't1',
      'obs-1',
      'BILLABLE',
    );

    expect(updated.billable_state).toBe('BILLABLE');
  });

  it("does not expose another tenant's observation by id", async () => {
    prismaMock.resourceObservation.findFirst.mockResolvedValue(null);

    await expect(
      service.getObservationById('tenant-b', 'obs-1'),
    ).rejects.toThrow();
    expect(prismaMock.resourceObservation.findFirst).toHaveBeenCalledWith({
      where: { id: 'obs-1', tenant_id: 'tenant-b' },
    });
  });
});
