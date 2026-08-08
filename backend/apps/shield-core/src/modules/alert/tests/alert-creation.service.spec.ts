import { Test, TestingModule } from '@nestjs/testing';
import { AlertCreationService } from '../services/alert-creation.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { AlertSuppressionService } from '../suppression/alert-suppression.service';
import { AlertRepository } from '../repositories/alert.repository';

describe('AlertCreationService', () => {
  let service: AlertCreationService;
  let prismaMock: any;
  let suppressionMock: any;
  let alertRepoMock: any;

  const baseInput = {
    tenantId: 'tenant-a',
    environmentId: 'env-1',
    detectionDefinitionId: 'def-1',
    detectionVersionId: 'v1',
    detectionMatchId: 'match-1',
    primaryEventId: 'evt-1',
    severity: 'HIGH',
    incompleteData: false,
    correlationId: 'corr-1',
    title: 'Suspicious Login',
  };

  beforeEach(async () => {
    prismaMock = {
      $transaction: jest.fn().mockImplementation((ops: any[]) => Promise.all(ops)),
      alert: { create: jest.fn().mockResolvedValue({ id: 'alert-1' }) },
      outboxEvent: { create: jest.fn().mockResolvedValue({ id: 'outbox-1' }) },
    };
    suppressionMock = { findActiveMatch: jest.fn().mockResolvedValue(null) };
    alertRepoMock = { findByDetectionMatch: jest.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertCreationService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: OutboxService, useValue: new OutboxService() },
        { provide: AlertSuppressionService, useValue: suppressionMock },
        { provide: AlertRepository, useValue: alertRepoMock },
      ],
    }).compile();

    service = module.get<AlertCreationService>(AlertCreationService);
  });

  it('creates a new Alert with status NEW and an alert.created outbox row when not suppressed', async () => {
    const result = await service.createFromMatch(baseInput);

    expect(result).toEqual({ alertId: 'alert-1', suppressed: false });
    expect(prismaMock.alert.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'NEW', detection_match_id: 'match-1' }) }),
    );
    expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ topic: 'alert.created.v1' }) }),
    );
  });

  it('dedups on the (tenant, detectionMatchId) key — a redelivered match never creates a second Alert (spec §5)', async () => {
    alertRepoMock.findByDetectionMatch.mockResolvedValue({ id: 'alert-existing', status: 'NEW' });

    const result = await service.createFromMatch(baseInput);

    expect(result).toEqual({ alertId: 'alert-existing', suppressed: false });
    expect(prismaMock.alert.create).not.toHaveBeenCalled();
  });

  it('creates the Alert as SUPPRESSED (not silently dropped) when an active suppression rule matches (spec §6)', async () => {
    suppressionMock.findActiveMatch.mockResolvedValue({ id: 'rule-1', reason: 'known benign automation account' });

    const result = await service.createFromMatch(baseInput);

    expect(result).toEqual({ alertId: 'alert-1', suppressed: true });
    expect(prismaMock.alert.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SUPPRESSED' }) }),
    );
    expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ topic: 'alert.suppressed.v1' }) }),
    );
  });
});
