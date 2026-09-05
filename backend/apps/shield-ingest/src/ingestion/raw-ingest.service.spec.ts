import { Test, TestingModule } from '@nestjs/testing';
import { RawIngestService } from './raw-ingest.service';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaProducerService } from '../kafka/kafka.producer.service';
import { StreamDeduplicationService } from '../deduplication/stream-deduplication.service';
import { DlqReplayQuarantineService } from '../dlq/dlq-replay-quarantine.service';
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
    expect(kafkaMock.emit).toHaveBeenCalledWith(
      'telemetry.ingested',
      expect.any(Object),
    );
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

  it('should discard duplicate via StreamDeduplicationService Bloom filter before database query', async () => {
    const dedupMock = {
      checkAndRegister: jest.fn().mockReturnValue({
        isDuplicate: true,
        eventDigest: 'dedup-hash-1234567890abcdef',
      }),
    };

    const moduleWithDedup: TestingModule = await Test.createTestingModule({
      providers: [
        RawIngestService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: KafkaProducerService, useValue: kafkaMock },
        { provide: StreamDeduplicationService, useValue: dedupMock },
      ],
    }).compile();

    const serviceWithDedup = moduleWithDedup.get<RawIngestService>(RawIngestService);
    prismaMock.connectorInstance.findUnique.mockResolvedValue(mockConnector);

    const result = await serviceWithDedup.processWebhookPayload(
      'conn-123',
      {},
      { sourceEventId: 'evt-bloom-dup', eventType: 'user.login' },
    );

    expect(result.processingStatus).toBe('DUPLICATE_IGNORED');
    expect(prismaMock.rawEvent.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.rawEvent.create).not.toHaveBeenCalled();
  });

  it('should route invalid payload to DLQ quarantine service', async () => {
    const dlqMock = {
      quarantineMessage: jest.fn(),
    };

    const moduleWithDlq: TestingModule = await Test.createTestingModule({
      providers: [
        RawIngestService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: KafkaProducerService, useValue: kafkaMock },
        { provide: DlqReplayQuarantineService, useValue: dlqMock },
      ],
    }).compile();

    const serviceWithDlq = moduleWithDlq.get<RawIngestService>(RawIngestService);
    prismaMock.connectorInstance.findUnique.mockResolvedValue({
      ...mockConnector,
      source_region: undefined, // Causes quarantine
    });
    prismaMock.rawEvent.create.mockResolvedValue({
      id: 'raw-quarantined',
      tenant_id: 'tenant-001',
      environment_id: 'prod-env',
      connector_id: 'conn-123',
      payload_hash: 'mock-hash',
      processing_status: 'QUARANTINED',
      received_at: new Date(),
    });

    const result = await serviceWithDlq.processWebhookPayload(
      'conn-123',
      {},
      { sourceEventId: 'evt-bad' },
    );

    expect(result.processingStatus).toBe('QUARANTINED');
    expect(dlqMock.quarantineMessage).toHaveBeenCalled();
  });
});
