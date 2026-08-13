import { Test, TestingModule } from '@nestjs/testing';
import { ReplayEngineService } from './replay-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { NormalizationService } from './normalization.service';
import { DetectionEngineService } from '../detection/detection-engine.service';

describe('ReplayEngineService', () => {
  let service: ReplayEngineService;
  let prismaMock: any;
  let normServiceMock: any;
  let detectionServiceMock: any;

  beforeEach(async () => {
    prismaMock = {
      detectionRule: {
        findFirst: jest.fn(),
      },
      normalizedEvent: {
        findMany: jest.fn(),
      },
    };

    normServiceMock = {
      reprocessQuarantinedEvent: jest.fn(),
    };

    detectionServiceMock = {
      evaluateRuleAgainstEvent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReplayEngineService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NormalizationService, useValue: normServiceMock },
        { provide: DetectionEngineService, useValue: detectionServiceMock },
      ],
    }).compile();

    service = module.get<ReplayEngineService>(ReplayEngineService);
  });

  it('should reprocess quarantined event successfully', async () => {
    normServiceMock.reprocessQuarantinedEvent.mockResolvedValue({
      quarantineId: 'q-1',
      status: 'NORMALIZED',
    });

    const result = await service.reprocessQuarantinedEvent('tenant-1', 'q-1');
    expect(result.status).toBe('NORMALIZED');
    expect(normServiceMock.reprocessQuarantinedEvent).toHaveBeenCalledWith('tenant-1', 'q-1');
  });
});
