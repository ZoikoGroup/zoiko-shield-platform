import { Test, TestingModule } from '@nestjs/testing';
import { NormalizationService } from './normalization.service';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaProducerService } from '../kafka/kafka.producer.service';
import { OutboxService } from '../outbox/outbox.service';
import { NotFoundException } from '@nestjs/common';

describe('NormalizationService', () => {
  let service: NormalizationService;
  let prismaMock: any;
  let kafkaMock: any;

  const mockRawEvent = {
    id: 'raw-100',
    tenant_id: 'tenant-001',
    environment_id: 'prod-env',
    connector_id: 'conn-123',
    source_type: 'generic',
    source_region: 'us',
    schema_version: 'v1.0',
    raw_payload_reference: JSON.stringify({
      eventId: 'evt-100',
      eventType: 'user.login',
      user: { id: 'u-123', email: 'alice@example.com' },
      sourceIp: '192.168.1.100',
      result: 'SUCCESS',
    }),
    occurred_at: new Date(),
  };

  beforeEach(async () => {
    prismaMock = {
      rawEvent: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn(),
      },
      normalizedEvent: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      quarantinedEvent: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      connectorHealthStatus: {
        findUnique: jest.fn().mockResolvedValue({ state: 'HEALTHY' }),
      },
      outboxEvent: {
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockImplementation((ops: any[]) => Promise.all(ops)),
    };

    kafkaMock = {
      emit: jest.fn().mockResolvedValue(true),
      publishEvent: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NormalizationService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: KafkaProducerService, useValue: kafkaMock },
        { provide: OutboxService, useValue: new OutboxService() },
      ],
    }).compile();

    service = module.get<NormalizationService>(NormalizationService);
  });

  it('should throw NotFoundException if raw event does not exist', async () => {
    prismaMock.rawEvent.findUnique.mockResolvedValue(null);
    await expect(service.normalizeRawEvent('invalid-id')).rejects.toThrow(NotFoundException);
  });

  it('should successfully normalize a valid raw event and write event.normalized.v1 to the outbox transactionally', async () => {
    prismaMock.rawEvent.findUnique.mockResolvedValue(mockRawEvent);
    prismaMock.normalizedEvent.create.mockResolvedValue({
      id: 'norm-1',
      tenant_id: 'tenant-001',
      environment_id: 'prod-env',
      connector_id: 'conn-123',
      raw_event_id: 'raw-100',
      event_class: 'AUTHENTICATION',
      severity: 'INFORMATIONAL',
      actor_email: 'alice@example.com',
      outcome: 'SUCCESS',
      occurred_at: new Date(),
      mapping_version: '1.0',
    });

    const result = await service.normalizeRawEvent('raw-100');

    expect(result).toHaveProperty('id', 'norm-1');
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.normalizedEvent.create).toHaveBeenCalled();
    expect(prismaMock.rawEvent.update).toHaveBeenCalledWith({
      where: { id: 'raw-100' },
      data: { processing_status: 'NORMALIZED' },
    });
    expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ topic: 'event.normalized.v1' }) }),
    );
    expect(kafkaMock.emit).toHaveBeenCalledWith('telemetry.normalized', expect.any(Object));
  });

  it('should quarantine a raw event with malformed JSON payload', async () => {
    const malformedRawEvent = {
      ...mockRawEvent,
      raw_payload_reference: '{ malformed json string ',
    };
    prismaMock.rawEvent.findUnique.mockResolvedValue(malformedRawEvent);
    prismaMock.quarantinedEvent.create.mockResolvedValue({
      id: 'quar-1',
      tenant_id: 'tenant-001',
      reason: 'MALFORMED_PAYLOAD',
    });

    const result = await service.normalizeRawEvent('raw-100');

    expect(result).toHaveProperty('reason', 'MALFORMED_PAYLOAD');
    expect(prismaMock.quarantinedEvent.create).toHaveBeenCalled();
  });
});
