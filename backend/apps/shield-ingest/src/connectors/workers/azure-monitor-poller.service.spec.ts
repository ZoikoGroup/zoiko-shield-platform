import { Test, TestingModule } from '@nestjs/testing';
import { AzureMonitorPollerService } from './azure-monitor-poller.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConnectorCheckpointService } from '../services/checkpoint.service';
import { ConnectorHealthService } from '../services/health.service';
import { HighThroughputBatchBufferService } from '../../ingestion/high-throughput-batch-buffer.service';

describe('AzureMonitorPollerService', () => {
  let service: AzureMonitorPollerService;
  let mockPrisma: any;
  let mockCheckpoint: any;
  let mockHealth: any;
  let mockBatchBuffer: any;

  beforeEach(async () => {
    mockPrisma = {
      connectorInstance: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'az-inst-1', tenant_id: 'tenant-az' },
        ]),
        findUnique: jest.fn().mockResolvedValue({
          id: 'az-inst-1',
          tenant_id: 'tenant-az',
        }),
      },
    };

    mockCheckpoint = {
      get: jest.fn().mockResolvedValue('20'),
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
        AzureMonitorPollerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConnectorCheckpointService, useValue: mockCheckpoint },
        { provide: ConnectorHealthService, useValue: mockHealth },
        { provide: HighThroughputBatchBufferService, useValue: mockBatchBuffer },
      ],
    }).compile();

    service = module.get<AzureMonitorPollerService>(AzureMonitorPollerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('pollConnector', () => {
    it('should poll incremental Azure events and save checkpoint', async () => {
      const result = await service.pollConnector('az-inst-1', 5);

      expect(result.status).toBe('SUCCESS');
      expect(result.polledCount).toBe(5);
      expect(result.newCheckpoint).toBe('25');
      expect(mockBatchBuffer.ingestBatch).toHaveBeenCalled();
      expect(mockCheckpoint.set).toHaveBeenCalledWith(
        'tenant-az',
        'az-inst-1',
        'azure-monitor',
        '25',
      );
      expect(mockHealth.updateHealth).toHaveBeenCalledWith(
        'az-inst-1',
        'tenant-az',
        'HEALTHY',
        expect.any(String),
      );
    });
  });

  describe('handleScheduledPoll', () => {
    it('should iterate over active instances and poll each', async () => {
      const pollSpy = jest.spyOn(service, 'pollConnector').mockResolvedValue({
        instanceId: 'az-inst-1',
        tenantId: 'tenant-az',
        polledCount: 5,
        newCheckpoint: '25',
        status: 'SUCCESS',
      });

      await service.handleScheduledPoll();

      expect(mockPrisma.connectorInstance.findMany).toHaveBeenCalled();
      expect(pollSpy).toHaveBeenCalledWith('az-inst-1');
    });
  });
});
