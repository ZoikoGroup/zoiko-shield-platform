import { Test, TestingModule } from '@nestjs/testing';
import { RawIngestService } from './raw-ingest.service';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaProducerService } from '../kafka/kafka.producer.service';
import { NotFoundException } from '@nestjs/common';

describe('RawIngestService', () => {
  let service: RawIngestService;
  let prismaMock: any;
  let kafkaMock: any;

  const mockConnector = {
    id: 'conn-123',
    tenant_id: 'tenant-001',
    environment_id: 'prod-env',
    authentication_type: 'WEBHOOK',
    source_region: 'us-east-1',
  };

  beforeEach(async () => {
    prismaMock = {
      connectorInstance: {
        findUnique: jest.fn(),
      },
      rawEvent: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };

    kafkaMock = {
      emit: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RawIngestService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: KafkaProducerService, useValue: kafkaMock },
      ],
    }).compile();

    service = module.get<RawIngestService>(RawIngestService);
  });

  it('should throw NotFoundException if connector does not exist', async () => {
    prismaMock.connectorInstance.findUnique.mockResolvedValue(null);

    await expect(
      service.processWebhookPayload('invalid-id', {}, { key: 'value' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should ingest valid payload and create raw event with payload hash', async () => {
    prismaMock.connectorInstance.findUnique.mockResolvedValue(mockConnector);
    prismaMock.rawEvent.findFirst.mockResolvedValue(null);
    prismaMock.rawEvent.create.mockResolvedValue({
      id: 'raw-1',
      tenant_id: 'tenant-001',
      environment_id: 'prod-env',
      connector_id: 'conn-123',
      source_event_id: 'evt-001',
      payload_hash: 'mock-hash',
      raw_payload_reference: '{"sourceEventId":"evt-001"}',
      processing_status: 'ACCEPTED',
      received_at: new Date(),
    });

    const result = await service.processWebhookPayload(
      'conn-123',
      { 'x-tenant-id': 'tenant-001' },
      { sourceEventId: 'evt-001', eventType: 'user.login' },
    );

    expect(result.processingStatus).toBe('ACCEPTED');
    expect(result.connectorId).toBe('conn-123');
    expect(prismaMock.rawEvent.create).toHaveBeenCalled();
    expect(kafkaMock.emit).toHaveBeenCalledWith('telemetry.ingested', expect.any(Object));
  });

  it('should return DUPLICATE_IGNORED if sourceEventId has already been processed', async () => {
    prismaMock.connectorInstance.findUnique.mockResolvedValue(mockConnector);
    prismaMock.rawEvent.findFirst.mockResolvedValue({
      id: 'raw-1',
      tenant_id: 'tenant-001',
      environment_id: 'prod-env',
      connector_id: 'conn-123',
      source_event_id: 'evt-001',
      payload_hash: 'mock-hash',
      processing_status: 'ACCEPTED',
      received_at: new Date(),
    });

    const result = await service.processWebhookPayload(
      'conn-123',
      {},
      { sourceEventId: 'evt-001' },
    );

    expect(result.processingStatus).toBe('DUPLICATE_IGNORED');
    expect(prismaMock.rawEvent.create).not.toHaveBeenCalled();
  });
});
