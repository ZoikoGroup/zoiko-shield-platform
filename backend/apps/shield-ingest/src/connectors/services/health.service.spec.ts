import { Test, TestingModule } from '@nestjs/testing';
import { ConnectorHealthService } from './health.service';
import { PrismaService } from '../../prisma/prisma.service';
import { KafkaProducerService } from '../../kafka/kafka.producer.service';
import { ConnectorRateLimitError } from '../core/connector-errors';

describe('ConnectorHealthService', () => {
  let service: ConnectorHealthService;
  let prismaMock: any;
  let kafkaMock: any;

  beforeEach(async () => {
    prismaMock = {
      connectorHealthStatus: {
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockReturnValue({ catch: jest.fn() }),
      },
      connectorInstance: {
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      connectorError: { create: jest.fn().mockResolvedValue({}) },
    };
    kafkaMock = { publishEvent: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectorHealthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: KafkaProducerService, useValue: kafkaMock },
      ],
    }).compile();

    service = module.get<ConnectorHealthService>(ConnectorHealthService);
  });

  it('resets consecutiveFailures to 0 on a healthy state transition and publishes connector.health.changed.v1', async () => {
    await service.updateHealth(
      'instance-1',
      'tenant-a',
      'HEALTHY',
      'Sync completed',
    );

    expect(prismaMock.connectorHealthStatus.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ consecutiveFailures: 0 }),
      }),
    );
    expect(kafkaMock.publishEvent).toHaveBeenCalledWith(
      'connector.health.changed.v1',
      'connector.health.changed',
      {
        tenantId: 'tenant-a',
        instanceId: 'instance-1',
        state: 'HEALTHY',
        message: 'Sync completed',
      },
    );
  });

  it('increments consecutiveFailures on a non-success state instead of resetting it', async () => {
    await service.updateHealth('instance-1', 'tenant-a', 'DEGRADED', 'boom');

    expect(prismaMock.connectorHealthStatus.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          consecutiveFailures: { increment: 1 },
        }),
      }),
    );
  });

  it('maps a ConnectorRateLimitError to RATE_LIMITED and persists the error record', async () => {
    await service.handleConnectorError(
      'instance-1',
      'tenant-a',
      new ConnectorRateLimitError(30, 'too many requests'),
    );

    expect(prismaMock.connectorInstance.update).toHaveBeenCalledWith({
      where: { id: 'instance-1' },
      data: { state: 'RATE_LIMITED' },
    });
    expect(prismaMock.connectorError.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ errorCode: 'RATE_LIMITED' }),
      }),
    );
  });

  // ─── OPS-INV-13: Active Connector Heartbeat Registration ───────────────────
  describe('recordHeartbeat (OPS-INV-13)', () => {
    it('upserts HEALTHY health status and updates connector instance state', async () => {
      await service.recordHeartbeat('inst-hb-1', 'tenant-hb', {
        lagMs: 120,
        eventsProcessed: 500,
        statusMessage: 'All systems nominal',
      });

      expect(prismaMock.connectorHealthStatus.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { instanceId: 'inst-hb-1' },
          update: expect.objectContaining({
            state: 'HEALTHY',
            consecutiveFailures: 0,
          }),
          create: expect.objectContaining({
            tenant_id: 'tenant-hb',
            instanceId: 'inst-hb-1',
            state: 'HEALTHY',
          }),
        }),
      );
    });

    it('updates the ConnectorInstance row to HEALTHY on heartbeat', async () => {
      await service.recordHeartbeat('inst-hb-2', 'tenant-hb');

      expect(prismaMock.connectorInstance.update).toHaveBeenCalledWith({
        where: { id: 'inst-hb-2' },
        data: { state: 'HEALTHY' },
      });
    });

    it('publishes connector.heartbeat.received Kafka event with correct payload', async () => {
      await service.recordHeartbeat('inst-hb-3', 'tenant-hb', {
        lagMs: 50,
        eventsProcessed: 1200,
      });

      expect(kafkaMock.publishEvent).toHaveBeenCalledWith(
        'connector.health.changed.v1',
        'connector.heartbeat.received',
        expect.objectContaining({
          tenantId: 'tenant-hb',
          instanceId: 'inst-hb-3',
          state: 'HEALTHY',
          lagMs: 50,
          eventsProcessed: 1200,
        }),
      );
    });

    it('defaults lagMs and eventsProcessed to 0 when payload is omitted', async () => {
      await service.recordHeartbeat('inst-hb-4', 'tenant-hb');

      expect(kafkaMock.publishEvent).toHaveBeenCalledWith(
        expect.any(String),
        'connector.heartbeat.received',
        expect.objectContaining({ lagMs: 0, eventsProcessed: 0 }),
      );
    });
  });

  // ─── OPS-INV-13: Automated Heartbeat Monitor Sweeper ──────────────────────
  describe('monitorConnectorHeartbeats (OPS-INV-13)', () => {
    it('skips instances with no lastSuccessfulConnectionAt recorded', async () => {
      prismaMock.connectorInstance.findMany = jest.fn().mockResolvedValue([
        {
          id: 'inst-stale-1',
          tenant_id: 'tenant-sweep',
          state: 'HEALTHY',
          connectorHealthStatus: { lastSuccessfulConnectionAt: null },
        },
      ]);

      await service.monitorConnectorHeartbeats();

      // No health update should be triggered for instance with no heartbeat timestamp
      expect(prismaMock.connectorHealthStatus.upsert).not.toHaveBeenCalled();
    });

    it('marks a connector DEGRADED when last heartbeat was between 60s and 180s ago', async () => {
      const eightySecondsAgo = new Date(Date.now() - 80 * 1000);
      prismaMock.connectorInstance.findMany = jest.fn().mockResolvedValue([
        {
          id: 'inst-deg-1',
          tenant_id: 'tenant-sweep',
          state: 'HEALTHY',
          connectorHealthStatus: { lastSuccessfulConnectionAt: eightySecondsAgo },
        },
      ]);

      await service.monitorConnectorHeartbeats();

      expect(prismaMock.connectorInstance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inst-deg-1' },
          data: { state: 'DEGRADED' },
        }),
      );
    });

    it('escalates to DEGRADED when last heartbeat was over 180s ago', async () => {
      const fiveMinutesAgo = new Date(Date.now() - 300 * 1000);
      prismaMock.connectorInstance.findMany = jest.fn().mockResolvedValue([
        {
          id: 'inst-stale-2',
          tenant_id: 'tenant-sweep',
          state: 'HEALTHY',
          connectorHealthStatus: { lastSuccessfulConnectionAt: fiveMinutesAgo },
        },
      ]);

      await service.monitorConnectorHeartbeats();

      // Should call updateHealth which sets state to DEGRADED
      expect(prismaMock.connectorInstance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { state: 'DEGRADED' },
        }),
      );
    });

    it('skips a DISCONNECTED instance even if heartbeat is very stale', async () => {
      const tenMinutesAgo = new Date(Date.now() - 600 * 1000);
      prismaMock.connectorInstance.findMany = jest.fn().mockResolvedValue([
        {
          id: 'inst-disconnected',
          tenant_id: 'tenant-sweep',
          state: 'DISCONNECTED',
          connectorHealthStatus: { lastSuccessfulConnectionAt: tenMinutesAgo },
        },
      ]);

      await service.monitorConnectorHeartbeats();

      expect(prismaMock.connectorHealthStatus.upsert).not.toHaveBeenCalled();
    });

    it('does not run if a sweep is already in progress (isSweeping guard)', async () => {
      prismaMock.connectorInstance.findMany = jest
        .fn()
        .mockResolvedValue([]);

      // Trigger two concurrent calls
      const p1 = service.monitorConnectorHeartbeats();
      const p2 = service.monitorConnectorHeartbeats();
      await Promise.all([p1, p2]);

      // findMany should only be called once despite two concurrent invocations
      expect(prismaMock.connectorInstance.findMany).toHaveBeenCalledTimes(1);
    });
  });
});
