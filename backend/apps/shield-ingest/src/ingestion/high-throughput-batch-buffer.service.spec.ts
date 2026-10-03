import { Test, TestingModule } from '@nestjs/testing';
import { HighThroughputBatchBufferService } from './high-throughput-batch-buffer.service';
import { KafkaProducerService } from '../kafka/kafka.producer.service';
import { MeteringService } from '../metering/metering.service';

describe('HighThroughputBatchBufferService', () => {
  let service: HighThroughputBatchBufferService;
  let mockKafkaProducer: { emit: jest.Mock };
  let mockMetering: { recordUsageObservation: jest.Mock };

  beforeEach(async () => {
    mockKafkaProducer = {
      emit: jest.fn(),
    };
    mockMetering = {
      recordUsageObservation: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HighThroughputBatchBufferService,
        { provide: KafkaProducerService, useValue: mockKafkaProducer },
        { provide: MeteringService, useValue: mockMetering },
      ],
    }).compile();

    service = module.get<HighThroughputBatchBufferService>(
      HighThroughputBatchBufferService,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should enqueue raw events into micro-batch buffer and track metrics', () => {
    const res1 = service.enqueueEvent(
      'tenant-high-scale',
      'production',
      'conn-crowdstrike',
      { action: 'PROCESS_START', pid: 1042, image: '/bin/bash' },
      'evt-raw-1001',
      'PROCESS_EXEC',
    );

    expect(res1.queued).toBe(true);
    expect(res1.currentBufferDepth).toBe(1);

    const metrics = service.getMetrics();
    expect(metrics.totalEventsEnqueued).toBe(1);
    expect(metrics.currentPendingEvents).toBe(1);
  });

  it('should flush buffer and calculate Merkle root hash for batch', () => {
    service.enqueueEvent(
      'tenant-high-scale',
      'production',
      'conn-crowdstrike',
      { log: 'test event 1' },
    );
    service.enqueueEvent(
      'tenant-high-scale',
      'production',
      'conn-crowdstrike',
      { log: 'test event 2' },
    );

    const receipt = service.flushBufferSync();
    expect(receipt).toBeDefined();
    expect(receipt?.flushedEventsCount).toBe(2);
    expect(receipt?.batchRootHash).toBeDefined();
    expect(receipt?.tenantId).toBe('tenant-high-scale');

    expect(mockKafkaProducer.emit).toHaveBeenCalledTimes(2);
    expect(mockMetering.recordUsageObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-high-scale',
        sourceType: 'INGESTION_RAW_EVENTS',
        acceptedQuantity: 2,
      }),
    );
  });

  it('should ingest a batch of events and compute buffer stats', async () => {
    const batchRes = await service.ingestBatch('tenant-high-scale', [
      { eventId: 'e1', payload: { log: 'msg1' } },
      { eventId: 'e2', payload: { log: 'msg2' } },
    ]);

    expect(batchRes.acceptedCount).toBe(2);
    expect(batchRes.droppedCount).toBe(0);
    expect(batchRes.backpressureTriggered).toBe(false);

    const stats = service.getBufferStats();
    expect(stats.currentQueueLength).toBe(2);
    expect(stats.maxBufferSize).toBe(50000);
  });

  it('should return null when flushing an empty buffer', () => {
    const receipt = service.flushBufferSync();
    expect(receipt).toBeNull();
  });
});
