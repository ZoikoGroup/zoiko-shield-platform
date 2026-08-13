import { Test, TestingModule } from '@nestjs/testing';
import { ControlTestingService } from './control-testing.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ControlTestingService (Step 13)', () => {
  let service: ControlTestingService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      controlObjective: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
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

  it('should create a tenant-owned control objective', async () => {
    prismaMock.controlObjective.create.mockImplementation(
      ({ data }: { data: any }) => Promise.resolve({ id: 'ctrl-1', ...data }),
    );

    const control = await service.createControlObjective({
      tenantId: 'tenant-1',
      code: 'MFA_ENFORCED',
      name: 'MFA is enforced',
    });

    expect(control.owner).toBe('tenant-1');
    expect(prismaMock.controlObjective.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        key: 'tenant-1:MFA_ENFORCED',
        owner: 'tenant-1',
      }),
    });
  });

  it('records INSUFFICIENT_EVIDENCE when no control-specific evaluator can prove the objective', async () => {
    prismaMock.controlObjective.findFirst.mockResolvedValue({
      id: 'ctrl-1',
      owner: 'tenant-1',
      key: 'tenant-1:MFA_ENFORCED',
      status: 'ACTIVE',
    });
    prismaMock.evidenceRecord.findMany.mockResolvedValue([{ id: 'ev-1' }]);
    prismaMock.normalizedEvent.count.mockResolvedValue(50);
    prismaMock.controlTestRun.create.mockResolvedValue({
      id: 'run-1',
      result: 'INSUFFICIENT_EVIDENCE',
    });

    const run = await service.evaluateControlObjective('tenant-1', 'ctrl-1');
    expect(run.result).toBe('INSUFFICIENT_EVIDENCE');
    expect(prismaMock.controlTestRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        result: 'INSUFFICIENT_EVIDENCE',
        tenant_id: 'tenant-1',
      }),
    });
  });
});
