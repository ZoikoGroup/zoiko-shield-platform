import { Test, TestingModule } from '@nestjs/testing';
import { ReplayEngineService } from '../normalization/replay-engine.service';
import { NormalizationService } from '../normalization/normalization.service';
import { DetectionEngineService } from '../detection/detection-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('Restore and Replay Testing (Step 33)', () => {
  let service: ReplayEngineService;
  let prismaMock: any;
  let normalizationMock: any;
  let detectionMock: any;

  beforeEach(async () => {
    prismaMock = {
      detectionRule: {
        findFirst: jest.fn(),
      },
      normalizedEvent: {
        findMany: jest.fn(),
      },
    };

    normalizationMock = {
      reprocessQuarantinedEvent: jest.fn(),
    };

    detectionMock = {
      evaluateNormalizedEvent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReplayEngineService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NormalizationService, useValue: normalizationMock },
        { provide: DetectionEngineService, useValue: detectionMock },
      ],
    }).compile();

    service = module.get<ReplayEngineService>(ReplayEngineService);
  });

  describe('reprocessQuarantinedEvent (Quarantine Recovery)', () => {
    it('should throw NotFoundException if quarantined event does not exist', async () => {
      normalizationMock.reprocessQuarantinedEvent.mockRejectedValue(
        new NotFoundException("Quarantined event 'missing-id' not found"),
      );

      await expect(
        service.reprocessQuarantinedEvent('tenant-123', 'missing-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reprocess valid quarantined event and return status REPROCESSED', async () => {
      normalizationMock.reprocessQuarantinedEvent.mockResolvedValue({
        quarantineId: 'q-1',
        rawEventId: 'raw-1',
        status: 'REPROCESSED',
        normalizedEventId: 'norm-1',
      });

      const res = await service.reprocessQuarantinedEvent('tenant-123', 'q-1');

      expect(res.status).toBe('REPROCESSED');
      expect(res.quarantineId).toBe('q-1');
      expect(normalizationMock.reprocessQuarantinedEvent).toHaveBeenCalledWith(
        'tenant-123',
        'q-1',
      );
    });
  });

  describe('replayEventsForDetection (Detection Rule Replay)', () => {
    it('should throw NotFoundException if detection rule is not found', async () => {
      prismaMock.detectionRule.findFirst.mockResolvedValue(null);

      await expect(
        service.replayEventsForDetection('tenant-123', 'missing-rule'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should re-evaluate historical events against updated detection rule', async () => {
      prismaMock.detectionRule.findFirst.mockResolvedValue({
        id: 'rule-1',
        tenant_id: 'tenant-123',
        name: 'Repeated Failed Logins',
      });

      prismaMock.normalizedEvent.findMany.mockResolvedValue([
        { id: 'evt-1', tenant_id: 'tenant-123' },
        { id: 'evt-2', tenant_id: 'tenant-123' },
      ]);

      detectionMock.evaluateNormalizedEvent
        .mockResolvedValueOnce([{ result: 'MATCH' }])
        .mockResolvedValueOnce([{ result: 'NO_MATCH' }]);

      const res = await service.replayEventsForDetection(
        'tenant-123',
        'rule-1',
      );

      expect(res.eventsEvaluated).toBe(2);
      expect(res.matchedCount).toBe(1);
      expect(detectionMock.evaluateNormalizedEvent).toHaveBeenCalledTimes(2);
    });
  });
});
