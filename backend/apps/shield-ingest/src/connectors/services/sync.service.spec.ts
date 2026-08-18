import { Test, TestingModule } from '@nestjs/testing';
import { ConnectorSyncService } from './sync.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConnectorRegistry } from '../core/connector-registry';
import { ConnectorHealthService } from './health.service';
import { KafkaProducerService } from '../../kafka/kafka.producer.service';
import { ConnectorAuthenticationError } from '../core/connector-errors';

describe('ConnectorSyncService', () => {
  let service: ConnectorSyncService;
  let prismaMock: any;
  let registryMock: any;
  let healthMock: any;
  let kafkaMock: any;
  let connectorMock: any;

  const instance = {
    id: 'instance-1',
    tenant_id: 'tenant-a',
    environment_id: 'env-1',
    region: 'us',
    source_region: 'us-east-1',
    definition: { provider: 'microsoft-entra' },
  };

  beforeEach(async () => {
    prismaMock = {
      connectorInstance: { findUnique: jest.fn().mockResolvedValue(instance) },
      connectorSynchronizationRun: {
        create: jest.fn().mockResolvedValue({ id: 'run-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    connectorMock = { sync: jest.fn() };
    registryMock = { get: jest.fn().mockReturnValue(connectorMock) };
    healthMock = {
      updateHealth: jest.fn().mockResolvedValue(undefined),
      recordSuccessfulSync: jest.fn().mockResolvedValue(undefined),
      handleConnectorError: jest.fn().mockResolvedValue(undefined),
    };
    kafkaMock = { publishEvent: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectorSyncService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConnectorRegistry, useValue: registryMock },
        { provide: ConnectorHealthService, useValue: healthMock },
        { provide: KafkaProducerService, useValue: kafkaMock },
      ],
    }).compile();

    service = module.get<ConnectorSyncService>(ConnectorSyncService);
  });

  it('throws for an unknown instance instead of silently no-op-ing', async () => {
    prismaMock.connectorInstance.findUnique.mockResolvedValue(null);

    await expect(service.runSync('missing')).rejects.toThrow(
      "Connector instance 'missing' not found",
    );
  });

  it('on success: records SUCCESS on the sync run, marks health HEALTHY, and publishes connector.sync.completed.v1', async () => {
    connectorMock.sync.mockResolvedValue({
      recordsProcessed: 5,
      recordsDuplicated: 1,
      recordsQuarantined: 0,
    });

    await service.runSync('instance-1');

    expect(prismaMock.connectorSynchronizationRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: expect.objectContaining({ status: 'SUCCESS', recordsProcessed: 5 }),
    });
    expect(healthMock.updateHealth).toHaveBeenCalledWith(
      'instance-1',
      'tenant-a',
      'HEALTHY',
      'Sync completed',
    );
    expect(kafkaMock.publishEvent).toHaveBeenCalledWith(
      'connector.sync.completed.v1',
      'connector.sync.completed',
      expect.objectContaining({ instanceId: 'instance-1', status: 'SUCCESS' }),
      expect.any(Object),
    );
  });

  it('on failure: records FAILED with the error code and routes into ConnectorHealthService.handleConnectorError instead of retrying inline', async () => {
    connectorMock.sync.mockRejectedValue(
      new ConnectorAuthenticationError('token expired'),
    );

    await service.runSync('instance-1');

    expect(prismaMock.connectorSynchronizationRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: expect.objectContaining({
        status: 'FAILED',
        errorCode: 'AUTH_FAILED',
      }),
    });
    expect(healthMock.handleConnectorError).toHaveBeenCalledTimes(1);
    expect(healthMock.updateHealth).not.toHaveBeenCalled();
    // A single runSync() call must make exactly one provider.sync() attempt —
    // retries are the caller/scheduler's concern, not this method's.
    expect(connectorMock.sync).toHaveBeenCalledTimes(1);
    expect(kafkaMock.publishEvent).not.toHaveBeenCalled();
  });
});
