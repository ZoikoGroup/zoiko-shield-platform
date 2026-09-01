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
        rawPayload: JSON.stringify({
          eventType: 'user.authentication.auth_via_mfa',
        }),
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
    expect(mockQuarantineService.markReprocessed).toHaveBeenCalledWith(
      'tenant-100',
      'quar-1',
    );
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

    mockRawIngestService.processWebhookPayload.mockRejectedValue(
      new Error('Downstream DB error'),
    );

    const result = await worker.replayQuarantineBatch('tenant-100');

    expect(result.totalProcessed).toBe(1);
    expect(result.replayedCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.errors[0].error).toContain('Downstream DB error');
    expect(mockQuarantineService.markReprocessed).not.toHaveBeenCalled();
  });

  it('should skip non-PENDING_REVIEW events during replay batch', async () => {
    mockQuarantineService.listQuarantinedEvents.mockReturnValue([
      {
        quarantineId: 'quar-3',
        tenantId: 'tenant-100',
        environmentId: 'env-prod',
        connectorId: 'conn-okta-01',
        rawPayload: JSON.stringify({ eventType: 'user.session.start' }),
        status: 'REPROCESSED', // Already done
      },
    ]);

    const result = await worker.replayQuarantineBatch('tenant-100');

    expect(result.totalProcessed).toBe(0);
    expect(result.replayedCount).toBe(0);
    expect(mockRawIngestService.processWebhookPayload).not.toHaveBeenCalled();
  });

  it('should record failure when raw payload is not valid JSON', async () => {
    mockQuarantineService.listQuarantinedEvents.mockReturnValue([
      {
        quarantineId: 'quar-4',
        tenantId: 'tenant-100',
        environmentId: 'env-prod',
        connectorId: 'conn-syslog-01',
        rawPayload: 'NOT_VALID_JSON{{',
        status: 'PENDING_REVIEW',
      },
    ]);

    const result = await worker.replayQuarantineBatch('tenant-100');

    expect(result.totalProcessed).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.errors[0].error).toContain('JSON parse failure');
    expect(mockRawIngestService.processWebhookPayload).not.toHaveBeenCalled();
  });

  // ─── OPS-INV-13: Automated DLQ Auto-Retry Cron Worker ────────────────────────
  describe('autoRetryQuarantinedWorker (OPS-INV-13 Cron)', () => {
    it('processes all tenants with pending quarantined events in a single sweep', async () => {
      // Simulate two tenants with quarantined messages
      const quarantine_t1 = [
        {
          quarantineId: 'quar-t1-01',
          tenantId: 'tenant-A',
          environmentId: 'env-prod',
          connectorId: 'conn-entra-01',
          rawPayload: JSON.stringify({ eventType: 'user.login' }),
          status: 'PENDING_REVIEW',
        },
      ];
      const quarantine_t2 = [
        {
          quarantineId: 'quar-t2-01',
          tenantId: 'tenant-B',
          environmentId: 'env-prod',
          connectorId: 'conn-falcon-01',
          rawPayload: JSON.stringify({ eventType: 'process.created' }),
          status: 'PENDING_REVIEW',
        },
      ];

      // getTenantsWithQuarantine returns two tenant IDs
      (mockQuarantineService as any).getTenantsWithQuarantine = jest
        .fn()
        .mockReturnValue(['tenant-A', 'tenant-B']);

      mockQuarantineService.listQuarantinedEvents
        .mockReturnValueOnce(quarantine_t1)
        .mockReturnValueOnce(quarantine_t2);

      mockRawIngestService.processWebhookPayload.mockResolvedValue({
        processingStatus: 'ACCEPTED',
      });

      await worker.autoRetryQuarantinedWorker();

      // Both tenants should have been retried
      expect(mockQuarantineService.listQuarantinedEvents).toHaveBeenCalledWith(
        'tenant-A',
      );
      expect(mockQuarantineService.listQuarantinedEvents).toHaveBeenCalledWith(
        'tenant-B',
      );
      expect(mockQuarantineService.markReprocessed).toHaveBeenCalledTimes(2);
    });

    it('does not process when isProcessing guard is active (concurrent-safe)', async () => {
      (mockQuarantineService as any).getTenantsWithQuarantine = jest
        .fn()
        .mockReturnValue([]);

      // Simulate first run still in progress by triggering two concurrent calls
      const p1 = worker.autoRetryQuarantinedWorker();
      const p2 = worker.autoRetryQuarantinedWorker();
      await Promise.all([p1, p2]);

      // getTenantsWithQuarantine only called once due to isProcessing guard
      expect(
        (mockQuarantineService as any).getTenantsWithQuarantine,
      ).toHaveBeenCalledTimes(1);
    });

    it('resets isProcessing to false even if an error occurs during sweep', async () => {
      (mockQuarantineService as any).getTenantsWithQuarantine = jest
        .fn()
        .mockImplementation(() => {
          throw new Error('Redis connection lost');
        });

      // Should NOT throw — error is swallowed inside the worker
      await expect(worker.autoRetryQuarantinedWorker()).resolves.not.toThrow();

      // Should be able to run again (isProcessing was reset to false)
      (mockQuarantineService as any).getTenantsWithQuarantine = jest
        .fn()
        .mockReturnValue([]);
      await expect(worker.autoRetryQuarantinedWorker()).resolves.not.toThrow();
      expect(
        (mockQuarantineService as any).getTenantsWithQuarantine,
      ).toHaveBeenCalledTimes(1);
    });
  });
});
