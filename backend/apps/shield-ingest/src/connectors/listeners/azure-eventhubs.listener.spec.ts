import { Test, TestingModule } from '@nestjs/testing';
import { AzureEventHubsIngestListener, EventHubConsumerOptions, EventHubReceivedEventData } from './azure-eventhubs.listener';
import { RawIngestService } from '../../ingestion/raw-ingest.service';
import { TokenBucketRateLimiterService } from '../../ingestion/rate-limiter/token-bucket-limiter.service';

describe('AzureEventHubsIngestListener', () => {
  let listener: AzureEventHubsIngestListener;
  let rawIngestService: RawIngestService;
  let rateLimiter: TokenBucketRateLimiterService;

  const mockRawIngestService = {
    processWebhookPayload: jest.fn(),
  };

  const mockRateLimiter = {
    consume: jest.fn(),
  };

  const defaultOptions: EventHubConsumerOptions = {
    eventHubName: 'zoiko-azure-activity-hub',
    partitionId: '0',
    tenantId: 'tenant-azure-01',
    environmentId: 'env-prod-eu',
    connectorId: 'conn-azure-monitor-01',
    region: 'westeurope',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AzureEventHubsIngestListener,
        { provide: RawIngestService, useValue: mockRawIngestService },
        { provide: TokenBucketRateLimiterService, useValue: mockRateLimiter },
      ],
    }).compile();

    listener = module.get<AzureEventHubsIngestListener>(AzureEventHubsIngestListener);
    rawIngestService = module.get<RawIngestService>(RawIngestService);
    rateLimiter = module.get<TokenBucketRateLimiterService>(TokenBucketRateLimiterService);
  });

  it('should be defined', () => {
    expect(listener).toBeDefined();
  });

  it('processes partition batch successfully and updates lastSequenceNumber', async () => {
    mockRateLimiter.consume.mockReturnValue({ allowed: true, remainingTokens: 95, tenantId: defaultOptions.tenantId });
    mockRawIngestService.processWebhookPayload.mockResolvedValue({ id: 'evt-eh-1', processingStatus: 'ACCEPTED' });

    const events: EventHubReceivedEventData[] = [
      {
        body: { operationName: 'Microsoft.Compute/virtualMachines/write', status: 'Succeeded' },
        sequenceNumber: 101,
        offset: '2048',
        enqueuedTimeUtc: new Date(),
      },
      {
        body: { operationName: 'Microsoft.Network/networkSecurityGroups/write', status: 'Succeeded' },
        sequenceNumber: 102,
        offset: '2112',
        enqueuedTimeUtc: new Date(),
      },
    ];

    const result = await listener.processPartitionBatch(defaultOptions, events);

    expect(result.totalReceived).toBe(2);
    expect(result.processedCount).toBe(2);
    expect(result.throttledCount).toBe(0);
    expect(result.lastSequenceNumber).toBe(102);
    expect(mockRawIngestService.processWebhookPayload).toHaveBeenCalledTimes(2);
  });

  it('throttles events when tenant rate limit is exceeded', async () => {
    mockRateLimiter.consume.mockReturnValue({ allowed: false, remainingTokens: 0, retryAfterMs: 300, tenantId: defaultOptions.tenantId });

    const events: EventHubReceivedEventData[] = [
      {
        body: { operationName: 'Microsoft.Authorization/roleAssignments/write' },
        sequenceNumber: 103,
        offset: '2200',
        enqueuedTimeUtc: new Date(),
      },
    ];

    const result = await listener.processPartitionBatch(defaultOptions, events);

    expect(result.totalReceived).toBe(1);
    expect(result.throttledCount).toBe(1);
    expect(result.processedCount).toBe(0);
    expect(mockRawIngestService.processWebhookPayload).not.toHaveBeenCalled();
  });
});
