import { Test, TestingModule } from '@nestjs/testing';
import { HighThroughputIngestController } from './high-throughput-ingest.controller';
import { HighThroughputBatchBufferService } from './high-throughput-batch-buffer.service';
import { WebhookSignatureGuard } from './guards/webhook-signature.guard';

describe('HighThroughputIngestController', () => {
  let controller: HighThroughputIngestController;
  let service: HighThroughputBatchBufferService;

  beforeEach(async () => {
    const mockBatchBufferService = {
      ingestBatch: jest.fn().mockResolvedValue({
        acceptedCount: 2,
        droppedCount: 0,
        bufferOccupancyRatio: 0.05,
        backpressureTriggered: false,
      }),
      getBufferStats: jest.fn().mockReturnValue({
        currentQueueLength: 5,
        maxBufferSize: 10000,
        occupancyRatio: 0.0005,
        totalFlushed: 100,
        totalDropped: 0,
        backpressureState: false,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HighThroughputIngestController],
      providers: [
        {
          provide: HighThroughputBatchBufferService,
          useValue: mockBatchBufferService,
        },
      ],
    })
      .overrideGuard(WebhookSignatureGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<HighThroughputIngestController>(
      HighThroughputIngestController,
    );
    service = module.get<HighThroughputBatchBufferService>(
      HighThroughputBatchBufferService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('ingestBatch', () => {
    it('should accept a batch of telemetry events and pass to buffer service', async () => {
      const dto = {
        events: [
          {
            eventId: 'evt-1',
            source: 'aws.cloudtrail',
            eventType: 'ConsoleLogin',
            timestamp: new Date().toISOString(),
            payload: { userId: 'alice' },
          },
          {
            eventId: 'evt-2',
            source: 'okta',
            eventType: 'user.authentication.verify',
            timestamp: new Date().toISOString(),
            payload: { userId: 'bob' },
          },
        ],
      };

      const result = await controller.ingestBatch('tenant-alpha', dto);

      expect(result.statusCode).toBe(202);
      expect(result.data.acceptedCount).toBe(2);
      expect(service.ingestBatch).toHaveBeenCalledWith('tenant-alpha', dto.events);
    });

    it('should handle empty events array gracefully', async () => {
      const result = await controller.ingestBatch('tenant-alpha', {
        events: [],
      });

      expect(result.statusCode).toBe(202);
      expect(service.ingestBatch).toHaveBeenCalledWith('tenant-alpha', []);
    });
  });

  describe('getMetrics', () => {
    it('should return real-time buffer metrics', () => {
      const metrics = controller.getMetrics();
      expect(metrics.statusCode).toBe(200);
      expect(metrics.data.totalFlushed).toBe(100);
      expect(service.getBufferStats).toHaveBeenCalled();
    });
  });
});
