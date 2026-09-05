import { Test, TestingModule } from '@nestjs/testing';
import { CloudNormalizationBridgeService } from './cloud-normalization-bridge.service';
import { OktaNormalizerService } from '../connectors/providers/okta/okta.normalizer';
import { AwsCloudTrailNormalizerService } from '../connectors/providers/aws-cloudtrail/aws-cloudtrail.normalizer';
import { CrowdStrikeNormalizerService } from '../connectors/providers/crowdstrike/crowdstrike.normalizer';
import { KafkaProducerService } from '../kafka/kafka.producer.service';
import { OktaEventPayload } from '../connectors/providers/okta/okta.types';
import { CloudTrailRawRecord } from '../connectors/providers/aws-cloudtrail/aws-cloudtrail.types';
import { CrowdStrikeDetectionPayload } from '../connectors/providers/crowdstrike/crowdstrike.types';

describe('CloudNormalizationBridgeService', () => {
  let service: CloudNormalizationBridgeService;
  let kafkaMock: { emit: jest.Mock };

  beforeEach(async () => {
    kafkaMock = {
      emit: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CloudNormalizationBridgeService,
        OktaNormalizerService,
        AwsCloudTrailNormalizerService,
        CrowdStrikeNormalizerService,
        { provide: KafkaProducerService, useValue: kafkaMock },
      ],
    }).compile();

    service = module.get<CloudNormalizationBridgeService>(
      CloudNormalizationBridgeService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should normalize Okta authentication event into canonical OCSF', async () => {
    const oktaPayload: OktaEventPayload = {
      eventId: 'okta-evt-001',
      published: '2026-09-05T08:00:00.000Z',
      eventType: 'user.authentication.sso',
      displayMessage: 'User single sign on to app',
      actor: {
        id: 'usr-123',
        type: 'User',
        alternateId: 'alice@corp.internal',
        displayName: 'Alice Security',
      },
      outcome: {
        result: 'SUCCESS',
      },
      client: {
        ipAddress: '198.51.100.22',
        geographicalContext: {
          city: 'Frankfurt',
          country: 'Germany',
        },
      },
    };

    const result = await service.normalizeOktaEvent(
      oktaPayload,
      'tenant-bank-01',
      'prod-env',
      'eu-central-1',
    );

    expect(result.provider).toBe('okta');
    expect(result.tenantId).toBe('tenant-bank-01');
    expect(result.ocsfClassUid).toBe(3002);
    expect(result.normalizedPayload.category_uid).toBe(3);
    expect(result.normalizedPayload.actor.user.email_addr).toBe(
      'alice@corp.internal',
    );
    expect(kafkaMock.emit).toHaveBeenCalledWith(
      'telemetry.normalized.v1',
      expect.objectContaining({ provider: 'okta' }),
    );
  });

  it('should normalize AWS CloudTrail record into canonical OCSF format', async () => {
    const cloudTrailRecord: CloudTrailRawRecord = {
      eventVersion: '1.08',
      eventID: 'ct-evt-7788',
      eventTime: '2026-09-05T08:05:00.000Z',
      eventSource: 'iam.amazonaws.com',
      eventName: 'PutUserPolicy',
      eventType: 'AwsApiCall',
      awsRegion: 'us-east-1',
      sourceIPAddress: '203.0.113.50',
      userAgent: 'aws-cli/2.15.0',
      recipientAccountId: '123456789012',
      requestID: 'req-8899',
      userIdentity: {
        type: 'IAMUser',
        principalId: 'AIDAJQABLZS4AEXAMPLE',
        arn: 'arn:aws:iam::123456789012:user/admin-user',
        accountId: '123456789012',
        userName: 'admin-user',
      },
      requestParameters: {
        userName: 'admin-user',
        policyName: 'AdminAccessPolicy',
      },
    };

    const result = await service.normalizeCloudTrailRecord(
      cloudTrailRecord,
      'tenant-fin-02',
      'cloud-prod',
      'us-east-1',
    );

    expect(result.provider).toBe('aws-cloudtrail');
    expect(result.tenantId).toBe('tenant-fin-02');
    expect(result.normalizedPayload.actor.user_name).toBe('admin-user');
    expect(result.normalizedPayload.status).toBe('SUCCESS');
    expect(kafkaMock.emit).toHaveBeenCalledWith(
      'telemetry.normalized.v1',
      expect.objectContaining({ provider: 'aws-cloudtrail' }),
    );
  });

  it('should normalize CrowdStrike Falcon detection payload into canonical OCSF format', async () => {
    const csPayload: CrowdStrikeDetectionPayload = {
      detection_id: 'det-cs-9900',
      created_timestamp: '2026-09-05T08:07:00.000Z',
      status: 'new',
      max_severity: 4,
      max_confidence: 90,
      device: {
        device_id: 'dev-win-01',
        hostname: 'ws-analyst-laptop',
        local_ip: '10.0.1.45',
        os_version: 'Windows 11',
      },
      behaviors: [
        {
          scenario: 'credential_theft',
          objective: 'execution',
          pattern_id: 1001,
          severity: 4,
          confidence: 90,
          timestamp: '2026-09-05T08:07:00.000Z',
          cmdline: 'powershell.exe -enc JABzACAAPQAgAE4AZQB3AC0ATwBiAGo...',
          filename: 'powershell.exe',
          sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          user_name: 'corp\\secops',
          tactic: 'Execution',
          technique: 'Command and Scripting Interpreter',
        },
      ],
    };

    const result = await service.normalizeCrowdStrikeDetection(
      csPayload,
      'tenant-sec-03',
      'corp-env',
      'us-west-2',
    );

    expect(result.provider).toBe('crowdstrike');
    expect(result.tenantId).toBe('tenant-sec-03');
    expect(result.ocsfClassUid).toBe(1007);
    expect(result.normalizedPayload.severity).toBe('CRITICAL');
    expect(result.normalizedPayload.device.hostname).toBe('ws-analyst-laptop');
    expect(kafkaMock.emit).toHaveBeenCalledWith(
      'telemetry.normalized.v1',
      expect.objectContaining({ provider: 'crowdstrike' }),
    );
  });
});
