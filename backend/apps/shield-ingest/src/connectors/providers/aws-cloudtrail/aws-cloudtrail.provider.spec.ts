import { Test, TestingModule } from '@nestjs/testing';
import { AwsCloudTrailProvider } from './aws-cloudtrail.provider';
import { AwsCloudTrailNormalizerService } from './aws-cloudtrail.normalizer';
import { CloudTrailRawRecord } from './aws-cloudtrail.types';

describe('AwsCloudTrailProvider & Normalizer', () => {
  let provider: AwsCloudTrailProvider;
  let normalizer: AwsCloudTrailNormalizerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AwsCloudTrailProvider, AwsCloudTrailNormalizerService],
    }).compile();

    provider = module.get<AwsCloudTrailProvider>(AwsCloudTrailProvider);
    normalizer = module.get<AwsCloudTrailNormalizerService>(
      AwsCloudTrailNormalizerService,
    );
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
    expect(normalizer).toBeDefined();
  });

  it('normalizes AWS CloudTrail IAM policy attachment event', () => {
    const sampleRecord: CloudTrailRawRecord = {
      eventVersion: '1.08',
      userIdentity: {
        type: 'IAMUser',
        principalId: 'AIDAEXAMPLE12345',
        arn: 'arn:aws:iam::123456789012:user/admin-user',
        accountId: '123456789012',
        userName: 'admin-user',
        sessionContext: {
          attributes: {
            mfaAuthenticated: 'true',
            creationDate: '2026-08-20T10:00:00Z',
          },
        },
      },
      eventTime: '2026-08-20T10:15:30Z',
      eventSource: 'iam.amazonaws.com',
      eventName: 'AttachRolePolicy',
      awsRegion: 'us-east-1',
      sourceIPAddress: '203.0.113.50',
      userAgent: 'aws-cli/2.15.0',
      requestParameters: {
        roleName: 'TargetProdRole',
        policyArn: 'arn:aws:iam::aws:policy/AdministratorAccess',
      },
      eventID: 'ct-evt-999',
      eventType: 'AwsApiCall',
      recipientAccountId: '123456789012',
    };

    const normalized = normalizer.normalizeRecord(
      sampleRecord,
      'tenant-acme',
      'env-prod',
      'us-east-1',
    );

    expect(normalized.tenant_id).toBe('tenant-acme');
    expect(normalized.provider).toBe('aws-cloudtrail');
    expect(normalized.actor.user_name).toBe('admin-user');
    expect(normalized.actor.mfa_authenticated).toBe(true);
    expect(normalized.target.service).toBe('iam.amazonaws.com');
    expect(normalized.target.action).toBe('AttachRolePolicy');
    expect(normalized.network.source_ip).toBe('203.0.113.50');
    expect(normalized.status).toBe('SUCCESS');
    expect(normalized.raw_payload_hash).toBeDefined();
  });

  it('handles CloudTrail API errors and marks status as FAILED', () => {
    const errorRecord: CloudTrailRawRecord = {
      eventVersion: '1.08',
      userIdentity: {
        type: 'Root',
        principalId: '123456789012',
        arn: 'arn:aws:iam::123456789012:root',
      },
      eventTime: '2026-08-20T11:00:00Z',
      eventSource: 's3.amazonaws.com',
      eventName: 'GetObject',
      awsRegion: 'us-west-2',
      sourceIPAddress: '198.51.100.77',
      userAgent: 'curl/7.88.1',
      eventID: 'ct-err-1',
      eventType: 'AwsApiCall',
      recipientAccountId: '123456789012',
      errorCode: 'AccessDenied',
      errorMessage: 'Access Denied to s3://secret-vault',
    };

    const normalized = normalizer.normalizeRecord(
      errorRecord,
      'tenant-acme',
      'env-prod',
      'us-west-2',
    );

    expect(normalized.status).toBe('FAILED');
    expect(normalized.error_code).toBe('AccessDenied');
  });
});
