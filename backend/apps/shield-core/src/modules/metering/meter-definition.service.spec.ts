import { ConflictException, ForbiddenException } from '@nestjs/common';
import { MeterDefinitionService } from './meter-definition.service';

describe('MeterDefinitionService (Category D1)', () => {
  let prisma: any;
  let service: MeterDefinitionService;

  beforeEach(() => {
    prisma = {
      meterDefinition: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new MeterDefinitionService(prisma);
  });

  it('requires non-empty source scope and visible validation rules', async () => {
    await expect(
      service.createDefinition(
        {
          meterKey: 'endpoint.telemetry',
          unit: 'EVENTS',
          sourceScope: [],
          validationRules: {},
        },
        'maker-1',
      ),
    ).rejects.toThrow(ConflictException);
    expect(prisma.meterDefinition.create).not.toHaveBeenCalled();
  });

  it('versions and persists the controlled source/unit/validation definition', async () => {
    prisma.meterDefinition.findFirst.mockResolvedValue({ version: 2 });
    prisma.meterDefinition.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'meter-3', ...data }),
    );

    const definition = await service.createDefinition(
      {
        meterKey: ' endpoint.telemetry ',
        unit: 'EVENTS',
        sourceScope: ['crowdstrike', 'crowdstrike'],
        validationRules: {
          schema: 'endpoint-v2',
          quantity: 'positive-integer',
        },
      },
      'maker-1',
    );

    expect(definition.version).toBe(3);
    expect(prisma.meterDefinition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source_scope: JSON.stringify(['crowdstrike']),
        validation_rules: JSON.stringify({
          schema: 'endpoint-v2',
          quantity: 'positive-integer',
        }),
        requested_by: 'maker-1',
      }),
    });
  });

  it('enforces maker-checker approval', async () => {
    prisma.meterDefinition.findUnique.mockResolvedValue({
      id: 'meter-1',
      status: 'DRAFT',
      requested_by: 'maker-1',
    });

    await expect(
      service.approveDefinition('meter-1', 'maker-1'),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.meterDefinition.update).not.toHaveBeenCalled();
  });
});
