import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';
import { AwsCloudTrailIngestService } from './aws-cloudtrail-ingest.service';
import { AwsCloudTrailNormalizerService } from './aws-cloudtrail.normalizer';
import { KafkaProducerService } from '../../../kafka/kafka.producer.service';
import { QuarantineService } from '../../../ingestion/quarantine.service';
import { CloudTrailRawRecord } from './aws-cloudtrail.types';

describe('AwsCloudTrailIngestService (Spec §5 & §20)', () => {
  let service: AwsCloudTrailIngestService;
  let normalizer: AwsCloudTrailNormalizerService;

  const mockKafkaProducer = {
    publishEvent: jest.fn().mockResolvedValue(undefined),
  };

  const mockQuarantineService = {
    quarantine: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AwsCloudTrailIngestService,
        AwsCloudTrailNormalizerService,
        { provide: KafkaProducerService, useValue: mockKafkaProducer },
        { provide: QuarantineService, useValue: mockQuarantineService },
      ],
    }).compile();

    service = module.get<AwsCloudTrailIngestService>(AwsCloudTrailIngestService);
    normalizer = module.get<AwsCloudTrailNormalizerService>(AwsCloudTrailNormalizerService);
    jest.clearAllMocks();
  });

  it('should successfully verify SigV4 HMAC-SHA256 signature', () => {
    const secret = 'aws-connector-test-secret-key-123';
    const payload = JSON.stringify({ eventID: 'evt-123', eventName: 'ConsoleLogin' });
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    const isValid = service.verifySigV4Auth(payload, signature, secret);
    expect(isValid).toBe(true);

    const isInvalid = service.verifySigV4Auth(payload, 'deadbeef1234', secret);
    expect(isInvalid).toBe(false);
  });

  it('should ingest, normalize, and publish valid CloudTrail records', async () => {
    const records: CloudTrailRawRecord[] = [
      {
        eventVersion: '1.08',
        userIdentity: {
          type: 'IAMUser',
          userName: 'alice.engineer',
          principalId: 'AIDACKCEVSQ6C2EXAMPLE',
          arn: 'arn:aws:iam::123456789012:user/alice.engineer',
          accountId: '123456789012',
        },
        eventTime: '2026-09-10T08:00:00Z',
        eventSource: 'iam.amazonaws.com',
        eventName: 'AttachUserPolicy',
        awsRegion: 'us-east-1',
        sourceIPAddress: '198.51.100.42',
        userAgent: 'aws-sdk-go/v1.44.0',
        eventID: 'evt-aws-ct-001',
        eventType: 'AwsApiCall',
        recipientAccountId: '123456789012',
        requestParameters: {
          userName: 'alice.engineer',
          policyArn: 'arn:aws:iam::aws:policy/AdministratorAccess',
        },
      },
    ];

    const result = await service.ingestCloudTrailBatch(
      'tenant-acme-prod',
      'PRODUCTION-US-EAST',
      records,
      'us-east-1',
    );

    expect(result.totalRecords).toBe(1);
    expect(result.acceptedCount).toBe(1);
    expect(result.quarantinedCount).toBe(0);
    expect(result.normalizedEvents.length).toBe(1);
    expect(result.normalizedEvents[0].actor.user_name).toBe('alice.engineer');
    expect(result.normalizedEvents[0].target.action).toBe('AttachUserPolicy');
    expect(mockKafkaProducer.publishEvent).toHaveBeenCalledTimes(1);
  });

  it('should route invalid/malformed records to QuarantineService DLQ', async () => {
    const malformedRecords: any[] = [
      {
        eventTime: '2026-09-10T08:00:00Z',
        // Missing mandatory eventID, eventName, eventSource
      },
    ];

    const result = await service.ingestCloudTrailBatch(
      'tenant-acme-prod',
      'PRODUCTION-US-EAST',
      malformedRecords,
    );

    expect(result.totalRecords).toBe(1);
    expect(result.acceptedCount).toBe(0);
    expect(result.quarantinedCount).toBe(1);
    expect(mockQuarantineService.quarantine).toHaveBeenCalledTimes(1);
  });
});
