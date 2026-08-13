import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { SlaMeasurementService } from './sla-measurement.service';
import { SlaDefinitionService } from './sla-definition.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('SlaMeasurementService (breach is derived, never asserted by the caller)', () => {
  let service: SlaMeasurementService;
  let prismaMock: any;
  let definitionMock: any;

  beforeEach(async () => {
    prismaMock = {
      contract: { findFirst: jest.fn().mockResolvedValue({ id: 'c-1' }) },
      slaMeasurement: { create: jest.fn(), findUnique: jest.fn() },
    };
    definitionMock = { getActiveDefinition: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlaMeasurementService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: SlaDefinitionService, useValue: definitionMock },
      ],
    }).compile();

    service = module.get<SlaMeasurementService>(SlaMeasurementService);
  });

  const baseDto = {
    slaKey: 'uptime.standard',
    contractId: 'c-1',
    periodStart: new Date(),
    periodEnd: new Date(),
  };

  it('fails closed with no approved SLA definition', async () => {
    definitionMock.getActiveDefinition.mockResolvedValue(null);

    await expect(
      service.recordMeasurement('t1', { ...baseDto, measuredValue: 99 }),
    ).rejects.toThrow(ConflictException);
  });

  it('a MIN-comparison metric (e.g. uptime) breaches when measured is below target', async () => {
    definitionMock.getActiveDefinition.mockResolvedValue({
      id: 'def-1',
      comparison: 'MIN',
      target_value: 99.9,
    });
    prismaMock.slaMeasurement.create.mockImplementation(({ data }: any) =>
      Promise.resolve(data),
    );

    const measurement = await service.recordMeasurement('t1', {
      ...baseDto,
      measuredValue: 99.5,
    });

    expect(measurement.breached).toBe(true);
  });

  it('a MIN-comparison metric does not breach when measured meets or exceeds target', async () => {
    definitionMock.getActiveDefinition.mockResolvedValue({
      id: 'def-1',
      comparison: 'MIN',
      target_value: 99.9,
    });
    prismaMock.slaMeasurement.create.mockImplementation(({ data }: any) =>
      Promise.resolve(data),
    );

    const measurement = await service.recordMeasurement('t1', {
      ...baseDto,
      measuredValue: 99.95,
    });

    expect(measurement.breached).toBe(false);
  });

  it('a MAX-comparison metric (e.g. response time) breaches when measured exceeds target', async () => {
    definitionMock.getActiveDefinition.mockResolvedValue({
      id: 'def-2',
      comparison: 'MAX',
      target_value: 15,
    });
    prismaMock.slaMeasurement.create.mockImplementation(({ data }: any) =>
      Promise.resolve(data),
    );

    const measurement = await service.recordMeasurement('t1', {
      ...baseDto,
      slaKey: 'response.standard',
      measuredValue: 20,
    });

    expect(measurement.breached).toBe(true);
  });

  it('hides measurements whose contract is not owned by the tenant', async () => {
    prismaMock.slaMeasurement.findUnique.mockResolvedValue({
      id: 'm-1',
      contract_id: 'c-1',
    });
    prismaMock.contract.findFirst.mockResolvedValue(null);

    await expect(
      service.getMeasurementById('tenant-b', 'm-1'),
    ).rejects.toThrow();
    expect(prismaMock.contract.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'c-1',
          commercialAccount: {
            entitlements: { some: { tenant_id: 'tenant-b' } },
          },
        }),
      }),
    );
  });
});
