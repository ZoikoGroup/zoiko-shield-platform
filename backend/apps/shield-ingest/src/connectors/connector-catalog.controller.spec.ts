import { Test, TestingModule } from '@nestjs/testing';
import { ConnectorCatalogController } from './connector-catalog.controller';
import { ConnectorCatalogService } from './connector-catalog.service';
import { IdempotencyService } from '../../../shield-core/src/modules/idempotency/idempotency.service';
import { ConnectorHealthService } from './services/health.service';
import { DLQReplayWorker } from '../ingestion/dlq-replay.worker';
import { DlqReplayQuarantineService } from '../dlq/dlq-replay-quarantine.service';

describe('ConnectorCatalogController (Idempotency P1 & INT-01)', () => {
  let controller: ConnectorCatalogController;
  let catalogServiceMock: any;
  let idempotencyServiceMock: any;

  beforeEach(async () => {
    catalogServiceMock = {
      getConnectorTypes: jest
        .fn()
        .mockReturnValue([
          { provider: 'microsoft-entra', name: 'Microsoft Entra ID' },
        ]),
      createConnector: jest
        .fn()
        .mockResolvedValue({ id: 'conn-100', name: 'Entra Prod' }),
      getConnectors: jest.fn().mockResolvedValue([]),
      getConnectorById: jest.fn().mockResolvedValue({ id: 'conn-100' }),
      updateConnector: jest.fn().mockResolvedValue({ id: 'conn-100' }),
      retireConnector: jest.fn().mockResolvedValue({ id: 'conn-100' }),
      testConnector: jest.fn().mockResolvedValue({ success: true }),
      activateConnector: jest
        .fn()
        .mockResolvedValue({ id: 'conn-100', state: 'CONNECTED' }),
      disableConnector: jest
        .fn()
        .mockResolvedValue({ id: 'conn-100', state: 'DISCONNECTED' }),
      syncConnector: jest.fn().mockResolvedValue({ status: 'STARTED' }),
      getConnectorHealth: jest.fn().mockResolvedValue({ state: 'HEALTHY' }),
    };

    idempotencyServiceMock = {
      run: jest
        .fn()
        .mockImplementation((params: any, fn: any) =>
          fn().then((res: any) => ({ ...res, replayed: false })),
        ),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConnectorCatalogController],
      providers: [
        { provide: ConnectorCatalogService, useValue: catalogServiceMock },
        { provide: IdempotencyService, useValue: idempotencyServiceMock },
      ],
    }).compile();

    controller = module.get<ConnectorCatalogController>(
      ConnectorCatalogController,
    );
  });

  it('should create connector without idempotency key', async () => {
    const result = await controller.createConnector(
      'tenant-1',
      undefined,
      undefined,
      {
        provider: 'microsoft-entra',
        name: 'Entra Prod',
      } as any,
    );

    expect(result.statusCode).toBe(201);
    expect(result.data.id).toBe('conn-100');
    expect(catalogServiceMock.createConnector).toHaveBeenCalled();
  });

  it('should process create connector through IdempotencyService when idempotency-key header is supplied', async () => {
    const result = await controller.createConnector(
      'tenant-1',
      'ikey-12345',
      undefined,
      {
        provider: 'microsoft-entra',
        name: 'Entra Prod',
      } as any,
    );

    expect(idempotencyServiceMock.run).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'ikey-12345',
        operation: 'connectors.create',
        tenantId: 'tenant-1',
      }),
      expect.any(Function),
    );
    expect(result.statusCode).toBe(201);
    expect(result.data.id).toBe('conn-100');
  });

  it('should process activate connector through IdempotencyService when idempotency-key header is supplied', async () => {
    const result = await controller.activateConnector(
      'tenant-1',
      'ikey-activate-99',
      undefined,
      'conn-100',
    );

    expect(idempotencyServiceMock.run).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'ikey-activate-99',
        operation: 'connectors.activate:conn-100',
        tenantId: 'tenant-1',
      }),
      expect.any(Function),
    );
    expect(result.statusCode).toBe(200);
    expect(result.data.state).toBe('CONNECTED');
  });
});

// ─── OPS-INV-13: Connector Heartbeat & DLQ Auto-Retry Endpoints ──────────────

describe('ConnectorCatalogController — OPS-INV-13 Heartbeat & DLQ', () => {
  let controller: ConnectorCatalogController;
  let catalogServiceMock: any;
  let healthServiceMock: any;
  let dlqWorkerMock: any;
  let dlqServiceMock: any;

  beforeEach(async () => {
    catalogServiceMock = {
      getConnectorTypes: jest.fn().mockReturnValue([]),
      createConnector: jest.fn(),
      getConnectors: jest.fn().mockResolvedValue([]),
      getConnectorById: jest.fn().mockResolvedValue({}),
      updateConnector: jest.fn().mockResolvedValue({}),
      retireConnector: jest.fn().mockResolvedValue({}),
      testConnector: jest.fn().mockResolvedValue({}),
      activateConnector: jest.fn().mockResolvedValue({}),
      disableConnector: jest.fn().mockResolvedValue({}),
      syncConnector: jest.fn().mockResolvedValue({}),
      getConnectorHealth: jest.fn().mockResolvedValue({ state: 'HEALTHY' }),
    };

    healthServiceMock = {
      recordHeartbeat: jest.fn().mockResolvedValue({
        instanceId: 'conn-hb-01',
        state: 'HEALTHY',
        consecutiveFailures: 0,
      }),
    };

    dlqWorkerMock = {
      replayQuarantineBatch: jest.fn().mockResolvedValue({
        totalProcessed: 3,
        replayedCount: 2,
        failedCount: 1,
        skippedCount: 0,
        errors: [{ quarantineId: 'quar-fail-01', error: 'parse error' }],
      }),
    };

    dlqServiceMock = {
      getMetrics: jest.fn().mockReturnValue({
        totalQuarantined: 10,
        activeQuarantined: 3,
        replayedSuccess: 6,
        replayedFailed: 1,
      }),
    };

    const module = await Test.createTestingModule({
      controllers: [ConnectorCatalogController],
      providers: [
        { provide: ConnectorCatalogService, useValue: catalogServiceMock },
        { provide: ConnectorHealthService, useValue: healthServiceMock },
        { provide: DLQReplayWorker, useValue: dlqWorkerMock },
        { provide: DlqReplayQuarantineService, useValue: dlqServiceMock },
      ],
    }).compile();

    controller = module.get<ConnectorCatalogController>(
      ConnectorCatalogController,
    );
  });

  describe('POST /connectors/:connectorId/heartbeat', () => {
    it('records heartbeat and returns HEALTHY status', async () => {
      const result = await controller.recordConnectorHeartbeat(
        'tenant-hb-01',
        'conn-hb-01',
        { lagMs: 80, eventsProcessed: 300 },
      );

      expect(result.statusCode).toBe(200);
      expect(result.message).toContain('heartbeat recorded');
      expect(healthServiceMock.recordHeartbeat).toHaveBeenCalledWith(
        'conn-hb-01',
        'tenant-hb-01',
        { lagMs: 80, eventsProcessed: 300 },
      );
    });

    it('returns acknowledgement when ConnectorHealthService is not injected', async () => {
      // Build a controller without the health service to test @Optional guard
      const bare = await Test.createTestingModule({
        controllers: [ConnectorCatalogController],
        providers: [
          { provide: ConnectorCatalogService, useValue: catalogServiceMock },
        ],
      }).compile();
      const bareController = bare.get<ConnectorCatalogController>(
        ConnectorCatalogController,
      );

      const result = await bareController.recordConnectorHeartbeat(
        'tenant-hb-01',
        'conn-hb-01',
      );

      expect(result.statusCode).toBe(200);
      expect(result.message).toBe('Heartbeat acknowledged');
    });
  });

  describe('POST /dlq/auto-retry (OPS-INV-13)', () => {
    it('triggers DLQ replay batch and returns result metrics', async () => {
      const result = await controller.triggerDlqAutoRetry('tenant-dlq-01', '25');

      expect(result.statusCode).toBe(200);
      expect(result.data?.totalProcessed).toBe(3);
      expect(result.data?.replayedCount).toBe(2);
      expect(result.data?.failedCount).toBe(1);
      expect(dlqWorkerMock.replayQuarantineBatch).toHaveBeenCalledWith(
        'tenant-dlq-01',
        25,
      );
    });

    it('uses default limit of 50 when no limit query param is provided', async () => {
      await controller.triggerDlqAutoRetry('tenant-dlq-01');

      expect(dlqWorkerMock.replayQuarantineBatch).toHaveBeenCalledWith(
        'tenant-dlq-01',
        50,
      );
    });
  });

  describe('GET /dlq/metrics', () => {
    it('returns DLQ quarantine metrics from DlqReplayQuarantineService', async () => {
      const result = await controller.getDlqMetrics();

      expect(result.statusCode).toBe(200);
      expect(result.data?.totalQuarantined).toBe(10);
      expect(result.data?.activeQuarantined).toBe(3);
      expect(result.data?.replayedSuccess).toBe(6);
    });

    it('returns zero metrics when DlqReplayQuarantineService is not injected', async () => {
      // Build without dlq service
      const bare = await Test.createTestingModule({
        controllers: [ConnectorCatalogController],
        providers: [
          { provide: ConnectorCatalogService, useValue: catalogServiceMock },
        ],
      }).compile();
      const bareController = bare.get<ConnectorCatalogController>(
        ConnectorCatalogController,
      );

      const result = await bareController.getDlqMetrics();

      expect(result.data?.totalQuarantined).toBe(0);
      expect(result.data?.activeQuarantined).toBe(0);
    });
  });
});
