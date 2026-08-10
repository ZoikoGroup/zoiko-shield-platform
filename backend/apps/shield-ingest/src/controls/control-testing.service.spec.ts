import { Test, TestingModule } from '@nestjs/testing';
import { ControlTestingService } from './control-testing.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ControlTestingService (Step 13)', () => {
  let service: ControlTestingService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      controlObjective: {
        upsert: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      evidenceRecord: {
        findMany: jest.fn(),
      },
      normalizedEvent: {
        count: jest.fn(),
      },
      controlTestRun: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ControlTestingService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<ControlTestingService>(ControlTestingService);
  });

  it('should seed default control objectives', async () => {
    prismaMock.controlObjective.upsert.mockImplementation(({ create }) =>
      Promise.resolve({ id: 'ctrl-1', ...create }),
    );

    const seeded = await service.seedDefaultControlObjectives('tenant-1');
    expect(seeded.length).toBe(4);
    expect(prismaMock.controlObjective.upsert).toHaveBeenCalledTimes(4);
  });

  it('should evaluate control objective and generate ControlTestRun with PASS result', async () => {
    prismaMock.controlObjective.findUnique.mockResolvedValue({
      id: 'ctrl-1',
      tenant_id: 'tenant-1',
      code: 'MFA_ENFORCED',
    });
    prismaMock.evidenceRecord.findMany.mockResolvedValue([{ id: 'ev-1' }]);
    prismaMock.normalizedEvent.count.mockResolvedValue(50);
    prismaMock.controlTestRun.create.mockResolvedValue({
      id: 'run-1',
      result: 'PASS',
    });

    const run = await service.evaluateControlObjective('ctrl-1');
    expect(run.result).toBe('PASS');
    expect(prismaMock.controlTestRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        result: 'PASS',
        evaluated_events_count: 50,
      }),
    });
  });
});
