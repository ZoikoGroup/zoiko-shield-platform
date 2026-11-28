import { Test, TestingModule } from '@nestjs/testing';
import { NormalizationService } from './normalization.service';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaProducerService } from '../kafka/kafka.producer.service';
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
    source_type: 'WEBHOOK',
    source_region: 'eu-west-1',
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
        update: jest.fn(),
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
        findFirst: jest.fn().mockResolvedValue({ state: 'HEALTHY' }),
      },
      connectorInstance: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'conn-123',
          definition: { provider: 'generic-webhook' },
        }),
      },
    };

    kafkaMock = {
      publishEvent: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NormalizationService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: KafkaProducerService, useValue: kafkaMock },
      ],
    }).compile();

    service = module.get<NormalizationService>(NormalizationService);
  });

  it('should throw NotFoundException if raw event does not exist', async () => {
    prismaMock.rawEvent.findUnique.mockResolvedValue(null);
    await expect(service.normalizeRawEvent('invalid-id')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should successfully normalize a valid raw event', async () => {
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
      recorded_at: new Date(),
      mapping_version: '1.0',
    });

    const result = await service.normalizeRawEvent('raw-100');

    expect(result).toHaveProperty('id', 'norm-1');
    expect(prismaMock.normalizedEvent.create).toHaveBeenCalled();
    expect(prismaMock.rawEvent.update).toHaveBeenCalledWith({
      where: { id: 'raw-100' },
      data: { processing_status: 'NORMALIZED' },
    });
    expect(kafkaMock.publishEvent).toHaveBeenCalledWith(
      'event.normalized.v1',
      'event.normalized',
      expect.objectContaining({
        tenantId: 'tenant-001',
        normalizedEventId: 'norm-1',
      }),
      expect.any(Object),
    );
  });

  it('should return the existing NormalizedEvent instead of re-normalizing an already-NORMALIZED raw event', async () => {
    prismaMock.rawEvent.findUnique.mockResolvedValue({
      ...mockRawEvent,
      processing_status: 'NORMALIZED',
    });
    prismaMock.normalizedEvent.findFirst = jest.fn().mockResolvedValue({
      id: 'norm-existing',
      raw_event_id: 'raw-100',
    });

    const result = await service.normalizeRawEvent('raw-100');

    expect(result).toHaveProperty('id', 'norm-existing');
    expect(prismaMock.normalizedEvent.create).not.toHaveBeenCalled();
    expect(kafkaMock.publishEvent).not.toHaveBeenCalled();
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

  describe('alert rules run on every newly normalized event', () => {
    const normalized = {
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
      recorded_at: new Date(),
      mapping_version: '1.0',
    };
    const withDetection = (evaluateTenantRules: jest.Mock) =>
      new NormalizationService(prismaMock, kafkaMock, {
        evaluateTenantRules,
      } as any);

    beforeEach(() => {
      prismaMock.rawEvent.findUnique.mockResolvedValue(mockRawEvent);
      prismaMock.normalizedEvent.create.mockResolvedValue(normalized);
    });

    it('hands the new event to the tenant rules', async () => {
      const evaluate = jest.fn().mockResolvedValue([]);
      await withDetection(evaluate).normalizeRawEvent('raw-100');
      expect(evaluate).toHaveBeenCalledWith(normalized);
    });

    it('a rule problem never fails a successfully normalized event', async () => {
      const evaluate = jest
        .fn()
        .mockRejectedValue(new Error('rule engine down'));
      await expect(
        withDetection(evaluate).normalizeRawEvent('raw-100'),
      ).resolves.toHaveProperty('id', 'norm-1');
    });

    it('runs the rules only after the event is stored and published', async () => {
      const order: string[] = [];
      prismaMock.normalizedEvent.create.mockImplementation(
        async () => (order.push('stored'), normalized),
      );
      kafkaMock.publishEvent.mockImplementation(
        async () => (order.push('published'), true),
      );
      await withDetection(
        jest.fn(async () => (order.push('rules'), [])),
      ).normalizeRawEvent('raw-100');
      expect(order).toEqual(['stored', 'published', 'rules']);
    });

    it('does not run them again for an already-normalized raw event', async () => {
      prismaMock.rawEvent.findUnique.mockResolvedValue({
        ...mockRawEvent,
        processing_status: 'NORMALIZED',
      });
      prismaMock.normalizedEvent.findFirst = jest
        .fn()
        .mockResolvedValue(normalized);
      const evaluate = jest.fn();
      await withDetection(evaluate).normalizeRawEvent('raw-100');
      expect(evaluate).not.toHaveBeenCalled();
    });

    it('works unchanged where no rule engine is wired', async () => {
      await expect(
        service.normalizeRawEvent('raw-100'),
      ).resolves.toHaveProperty('id', 'norm-1');
    });
  });
});
