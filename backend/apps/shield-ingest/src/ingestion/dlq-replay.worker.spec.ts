import { Test, TestingModule } from '@nestjs/testing';
import { DLQReplayWorker } from './dlq-replay.worker';
import { QuarantineService } from './quarantine.service';
import { RawIngestService } from './raw-ingest.service';

describe('DLQReplayWorker', () => {
  let worker: DLQReplayWorker;
  let quarantineService: QuarantineService;
  let rawIngestService: RawIngestService;

  const mockQuarantineService = {
    listQuarantinedEvents: jest.fn(),
    markReprocessed: jest.fn(),
  };

  const mockRawIngestService = {
    processWebhookPayload: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DLQReplayWorker,
        { provide: QuarantineService, useValue: mockQuarantineService },
        { provide: RawIngestService, useValue: mockRawIngestService },
      ],
    }).compile();

    worker = module.get<DLQReplayWorker>(DLQReplayWorker);
    quarantineService = module.get<QuarantineService>(QuarantineService);
    rawIngestService = module.get<RawIngestService>(RawIngestService);
  });

  it('should be defined', () => {
    expect(worker).toBeDefined();
  });

  it('should replay pending quarantined events successfully', async () => {
    mockQuarantineService.listQuarantinedEvents.mockReturnValue([
      {
        quarantineId: 'quar-1',
        tenantId: 'tenant-100',
        environmentId: 'env-prod',
        connectorId: 'conn-okta-01',
        rawPayload: JSON.stringify({ eventType: 'user.authentication.auth_via_mfa' }),
        status: 'PENDING_REVIEW',
      },
    ]);

    mockRawIngestService.processWebhookPayload.mockResolvedValue({
      id: 'evt-replayed-1',
      tenantId: 'tenant-100',
      environmentId: 'env-prod',
      connectorId: 'conn-okta-01',
      payloadHash: 'hash123',
      processingStatus: 'ACCEPTED',
      receivedAt: new Date(),
    });

    const result = await worker.replayQuarantineBatch('tenant-100');

    expect(result.totalProcessed).toBe(1);
    expect(result.replayedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(mockQuarantineService.markReprocessed).toHaveBeenCalledWith('tenant-100', 'quar-1');
  });

  it('should record failure if re-ingest throws an error', async () => {
    mockQuarantineService.listQuarantinedEvents.mockReturnValue([
      {
        quarantineId: 'quar-2',
        tenantId: 'tenant-100',
        environmentId: 'env-prod',
        connectorId: 'conn-crowdstrike-01',
        rawPayload: JSON.stringify({ bad: 'data' }),
        status: 'PENDING_REVIEW',
      },
    ]);

    mockRawIngestService.processWebhookPayload.mockRejectedValue(new Error('Downstream DB error'));

    const result = await worker.replayQuarantineBatch('tenant-100');

    expect(result.totalProcessed).toBe(1);
    expect(result.replayedCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.errors[0].error).toContain('Downstream DB error');
    expect(mockQuarantineService.markReprocessed).not.toHaveBeenCalled();
  });
});
