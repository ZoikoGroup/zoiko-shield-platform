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
      quarantinedEvent: {
        findUnique: jest.fn(),
      },
      detectionRule: {
        findUnique: jest.fn(),
      },
      normalizedEvent: {
        findMany: jest.fn(),
      },
    };

    normServiceMock = {
      normalizePayload: jest.fn(),
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
    prismaMock.quarantinedEvent.findUnique.mockResolvedValue({
      id: 'q-1',
      tenant_id: 'tenant-1',
      rawPayload: '{"eventId":"evt-1"}',
    });

    normServiceMock.normalizePayload.mockResolvedValue({
      eventId: 'evt-1',
      status: 'NORMALIZED',
    });

    const result = await service.reprocessQuarantinedEvent('q-1');
    expect(result.status).toBe('REPROCESSED');
    expect(normServiceMock.normalizePayload).toHaveBeenCalled();
  });
});
