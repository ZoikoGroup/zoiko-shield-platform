import { Test, TestingModule } from '@nestjs/testing';
import {
  AwsSqsIngestListener,
  SqsPollOptions,
  SqsMessagePayload,
} from './aws-sqs.listener';
import { RawIngestService } from '../../ingestion/raw-ingest.service';
import { TokenBucketRateLimiterService } from '../../ingestion/rate-limiter/token-bucket-limiter.service';

describe('AwsSqsIngestListener', () => {
  let listener: AwsSqsIngestListener;
  let rawIngestService: RawIngestService;
  let rateLimiter: TokenBucketRateLimiterService;

  const mockRawIngestService = {
    processWebhookPayload: jest.fn(),
  };

  const mockRateLimiter = {
    consume: jest.fn(),
  };

  const defaultOptions: SqsPollOptions = {
    queueUrl:
      'https://sqs.us-east-1.amazonaws.com/123456789012/zoiko-telemetry-queue',
    tenantId: 'tenant-sqs-01',
    environmentId: 'env-prod',
    connectorId: 'conn-cloudtrail-01',
    region: 'us-east-1',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AwsSqsIngestListener,
        { provide: RawIngestService, useValue: mockRawIngestService },
        { provide: TokenBucketRateLimiterService, useValue: mockRateLimiter },
      ],
    }).compile();

    listener = module.get<AwsSqsIngestListener>(AwsSqsIngestListener);
    rawIngestService = module.get<RawIngestService>(RawIngestService);
    rateLimiter = module.get<TokenBucketRateLimiterService>(
      TokenBucketRateLimiterService,
    );
  });

  it('should be defined', () => {
    expect(listener).toBeDefined();
  });

  it('processes valid SQS message batch and returns deleted handles', async () => {
    mockRateLimiter.consume.mockReturnValue({
      allowed: true,
      remainingTokens: 99,
      tenantId: defaultOptions.tenantId,
    });

    mockRawIngestService.processWebhookPayload.mockResolvedValue({
      id: 'evt-sqs-1',
      processingStatus: 'ACCEPTED',
    });

    const messages: SqsMessagePayload[] = [
      {
        messageId: 'msg-001',
        receiptHandle: 'handle-001',
        body: JSON.stringify({
          eventName: 'ConsoleLogin',
          eventSource: 'signin.amazonaws.com',
        }),
      },
      {
        messageId: 'msg-002',
        receiptHandle: 'handle-002',
        body: JSON.stringify({
          eventName: 'AuthorizeSecurityGroupIngress',
          eventSource: 'ec2.amazonaws.com',
        }),
      },
    ];

    const result = await listener.processMessageBatch(defaultOptions, messages);

    expect(result.totalReceived).toBe(2);
    expect(result.processedCount).toBe(2);
    expect(result.throttledCount).toBe(0);
    expect(result.errorCount).toBe(0);
    expect(result.deletedReceiptHandles).toEqual(['handle-001', 'handle-002']);
    expect(mockRawIngestService.processWebhookPayload).toHaveBeenCalledTimes(2);
  });

  it('throttles messages when tenant exceeds token bucket capacity', async () => {
    mockRateLimiter.consume.mockReturnValue({
      allowed: false,
      remainingTokens: 0,
      retryAfterMs: 500,
      tenantId: defaultOptions.tenantId,
    });

    const messages: SqsMessagePayload[] = [
      {
        messageId: 'msg-003',
        receiptHandle: 'handle-003',
        body: JSON.stringify({ eventName: 'AssumeRole' }),
      },
    ];

    const result = await listener.processMessageBatch(defaultOptions, messages);

    expect(result.totalReceived).toBe(1);
    expect(result.throttledCount).toBe(1);
    expect(result.processedCount).toBe(0);
    expect(result.deletedReceiptHandles).toHaveLength(0);
    expect(mockRawIngestService.processWebhookPayload).not.toHaveBeenCalled();
  });

  it('handles malformed JSON body without crashing and records error', async () => {
    mockRateLimiter.consume.mockReturnValue({
      allowed: true,
      remainingTokens: 50,
      tenantId: defaultOptions.tenantId,
    });

    const messages: SqsMessagePayload[] = [
      {
        messageId: 'msg-004',
        receiptHandle: 'handle-004',
        body: '{ malformed json ::',
      },
    ];

    const result = await listener.processMessageBatch(defaultOptions, messages);

    expect(result.totalReceived).toBe(1);
    expect(result.errorCount).toBe(1);
    expect(result.processedCount).toBe(0);
    expect(result.deletedReceiptHandles).toHaveLength(0);
  });

  it('routes poison and failed messages to DlqReplayQuarantineService when available', async () => {
    const mockDlqService = {
      quarantineMessage: jest.fn(),
    };

    const moduleWithDlq: TestingModule = await Test.createTestingModule({
      providers: [
        AwsSqsIngestListener,
        { provide: RawIngestService, useValue: mockRawIngestService },
        { provide: TokenBucketRateLimiterService, useValue: mockRateLimiter },
        { provide: 'DlqReplayQuarantineService', useValue: mockDlqService },
      ],
    }).compile();

    const listenerWithDlq = new AwsSqsIngestListener(
      mockRawIngestService as any,
      mockRateLimiter as any,
      mockDlqService as any,
    );

    mockRateLimiter.consume.mockReturnValue({
      allowed: true,
      remainingTokens: 50,
      tenantId: defaultOptions.tenantId,
    });

    // 1. Test malformed JSON
    await listenerWithDlq.processMessageBatch(defaultOptions, [
      {
        messageId: 'msg-dlq-01',
        receiptHandle: 'handle-dlq-01',
        body: 'invalid-json-content',
      },
    ]);

    expect(mockDlqService.quarantineMessage).toHaveBeenCalledWith(
      defaultOptions.tenantId,
      `sqs:${defaultOptions.queueUrl}`,
      expect.objectContaining({ messageId: 'msg-dlq-01' }),
      expect.stringContaining('Failed to parse SQS message body'),
      'JSON_PARSE_ERROR',
    );

    // 2. Test ingest processing failure
    mockRawIngestService.processWebhookPayload.mockRejectedValueOnce(
      new Error('Kafka pipeline timeout'),
    );

    await listenerWithDlq.processMessageBatch(defaultOptions, [
      {
        messageId: 'msg-dlq-02',
        receiptHandle: 'handle-dlq-02',
        body: JSON.stringify({ event: 'Threat' }),
      },
    ]);

    expect(mockDlqService.quarantineMessage).toHaveBeenCalledWith(
      defaultOptions.tenantId,
      `sqs:${defaultOptions.queueUrl}`,
      { event: 'Threat' },
      expect.stringContaining(
        'Error ingesting SQS message: Kafka pipeline timeout',
      ),
      'INGEST_PROCESSING_ERROR',
    );
  });
});
