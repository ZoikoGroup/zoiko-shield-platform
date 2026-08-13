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
      connectorInstance: { update: jest.fn().mockResolvedValue({}) },
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
});
