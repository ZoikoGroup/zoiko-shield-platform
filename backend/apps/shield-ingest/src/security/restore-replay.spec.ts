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

    normalizationMock = {
      normalizePayload: jest.fn(),
    };

    detectionMock = {
      evaluateRuleAgainstEvent: jest.fn(),
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
      prismaMock.quarantinedEvent.findUnique.mockResolvedValue(null);

      await expect(service.reprocessQuarantinedEvent('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reprocess valid quarantined event and return status REPROCESSED', async () => {
      prismaMock.quarantinedEvent.findUnique.mockResolvedValue({
        id: 'q-1',
        tenant_id: 'tenant-123',
        rawPayload: JSON.stringify({ eventType: 'user.login', result: 'FAILED' }),
      });

      normalizationMock.normalizePayload.mockResolvedValue({
        id: 'norm-1',
        status: 'SUCCESS',
      });

      const res = await service.reprocessQuarantinedEvent('q-1');

      expect(res.status).toBe('REPROCESSED');
      expect(res.quarantinedId).toBe('q-1');
      expect(normalizationMock.normalizePayload).toHaveBeenCalledWith(
        'tenant-123',
        'q-1',
        'WEBHOOK',
        { eventType: 'user.login', result: 'FAILED' },
      );
    });
  });

  describe('replayEventsForDetection (Detection Rule Replay)', () => {
    it('should throw NotFoundException if detection rule is not found', async () => {
      prismaMock.detectionRule.findUnique.mockResolvedValue(null);

      await expect(service.replayEventsForDetection('missing-rule')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should re-evaluate historical events against updated detection rule', async () => {
      prismaMock.detectionRule.findUnique.mockResolvedValue({
        id: 'rule-1',
        tenant_id: 'tenant-123',
        name: 'Repeated Failed Logins',
      });

      prismaMock.normalizedEvent.findMany.mockResolvedValue([
        { id: 'evt-1', tenant_id: 'tenant-123' },
        { id: 'evt-2', tenant_id: 'tenant-123' },
      ]);

      detectionMock.evaluateRuleAgainstEvent
        .mockResolvedValueOnce({ matched: true })
        .mockResolvedValueOnce({ matched: false });

      const res = await service.replayEventsForDetection('rule-1');

      expect(res.eventsEvaluated).toBe(2);
      expect(res.matchedCount).toBe(1);
      expect(detectionMock.evaluateRuleAgainstEvent).toHaveBeenCalledTimes(2);
    });
  });
});
