import { Test, TestingModule } from '@nestjs/testing';
import { AwsCloudTrailPollerService } from './aws-cloudtrail-poller.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConnectorCheckpointService } from '../services/checkpoint.service';
import { ConnectorHealthService } from '../services/health.service';
import { HighThroughputBatchBufferService } from '../../ingestion/high-throughput-batch-buffer.service';

describe('AwsCloudTrailPollerService', () => {
  let service: AwsCloudTrailPollerService;
  let mockPrisma: any;
  let mockCheckpoint: any;
  let mockHealth: any;
  let mockBatchBuffer: any;

  beforeEach(async () => {
    mockPrisma = {
      connectorInstance: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'inst-1', tenant_id: 'tenant-1' }]),
        findUnique: jest.fn().mockResolvedValue({
          id: 'inst-1',
          tenant_id: 'tenant-1',
        }),
      },
    };

    mockCheckpoint = {
      get: jest.fn().mockResolvedValue('10'),
      set: jest.fn().mockResolvedValue(undefined),
    };

    mockHealth = {
      updateHealth: jest.fn().mockResolvedValue({}),
    };

    mockBatchBuffer = {
      ingestBatch: jest.fn().mockResolvedValue({
        acceptedCount: 5,
        droppedCount: 0,
        bufferOccupancyRatio: 0.01,
        backpressureTriggered: false,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AwsCloudTrailPollerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConnectorCheckpointService, useValue: mockCheckpoint },
        { provide: ConnectorHealthService, useValue: mockHealth },
        {
          provide: HighThroughputBatchBufferService,
          useValue: mockBatchBuffer,
        },
      ],
    }).compile();

    service = module.get<AwsCloudTrailPollerService>(
      AwsCloudTrailPollerService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('pollConnector', () => {
    it('should poll incremental CloudTrail records and push to batch buffer', async () => {
      const result = await service.pollConnector('inst-1', 5);

      expect(result.status).toBe('SUCCESS');
      expect(result.polledCount).toBe(5);
      expect(result.newCheckpoint).toBe('15');
      expect(mockBatchBuffer.ingestBatch).toHaveBeenCalled();
      expect(mockCheckpoint.set).toHaveBeenCalledWith(
        'tenant-1',
        'inst-1',
        'aws-cloudtrail',
        '15',
      );
      expect(mockHealth.updateHealth).toHaveBeenCalledWith(
        'inst-1',
        'tenant-1',
        'HEALTHY',
        expect.any(String),
      );
    });
  });

  describe('handleScheduledPoll', () => {
    it('should iterate over active instances and poll each', async () => {
      const pollSpy = jest.spyOn(service, 'pollConnector').mockResolvedValue({
        instanceId: 'inst-1',
        tenantId: 'tenant-1',
        polledCount: 5,
        newCheckpoint: '15',
        status: 'SUCCESS',
      });

      await service.handleScheduledPoll();

      expect(mockPrisma.connectorInstance.findMany).toHaveBeenCalled();
      expect(pollSpy).toHaveBeenCalledWith('inst-1');
    });
  });
});
