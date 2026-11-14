import { Test, TestingModule } from '@nestjs/testing';
import {
  AzureMonitorPollerService,
  AZURE_MONITOR_NOT_COLLECTING_MESSAGE,
} from './azure-monitor-poller.service';
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
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'az-inst-1', tenant_id: 'tenant-az' }]),
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
        {
          provide: HighThroughputBatchBufferService,
          useValue: mockBatchBuffer,
        },
      ],
    }).compile();

    service = module.get<AzureMonitorPollerService>(AzureMonitorPollerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('pollConnector', () => {
    it('collects nothing, pushes nothing into the pipeline and marks the connector as not collecting', async () => {
      const result = await service.pollConnector('az-inst-1');

      expect(result.status).toBe('NOT_IMPLEMENTED');
      expect(result.polledCount).toBe(0);
      expect(mockBatchBuffer.ingestBatch).not.toHaveBeenCalled();
      expect(mockCheckpoint.set).not.toHaveBeenCalled();
      expect(mockHealth.updateHealth).toHaveBeenCalledWith(
        'az-inst-1',
        expect.any(String),
        'DEGRADED',
        AZURE_MONITOR_NOT_COLLECTING_MESSAGE,
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

      expect(mockPrisma.connectorInstance.findMany).toHaveBeenCalledWith({
        where: { definition: { provider: 'azure-monitor' }, deletedAt: null },
      });
      expect(pollSpy).toHaveBeenCalledWith('az-inst-1');
    });
  });
});
