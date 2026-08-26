import { Test, TestingModule } from '@nestjs/testing';
import { AwsGuardDutyProvider } from './aws-guardduty.provider';
import { AwsGuardDutyNormalizerService } from './aws-guardduty.normalizer';
import { GuardDutyFinding } from './aws-guardduty.types';

describe('AwsGuardDutyProvider & Normalizer', () => {
  let provider: AwsGuardDutyProvider;
  let normalizer: AwsGuardDutyNormalizerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AwsGuardDutyProvider, AwsGuardDutyNormalizerService],
    }).compile();

    provider = module.get<AwsGuardDutyProvider>(AwsGuardDutyProvider);
    normalizer = module.get<AwsGuardDutyNormalizerService>(
      AwsGuardDutyNormalizerService,
    );
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
    expect(normalizer).toBeDefined();
  });

  it('normalizes EC2 SSH Brute Force finding from GuardDuty', () => {
    const sampleFinding: GuardDutyFinding = {
      schemaVersion: '2.0',
      accountId: '123456789012',
      region: 'eu-west-1',
      partition: 'aws',
      id: 'gd-find-101',
      arn: 'arn:aws:guardduty:eu-west-1:123456789012:detector/det-1/finding/gd-find-101',
      type: 'UnauthorizedAccess:EC2/SSHBruteForce',
      resource: {
        resourceType: 'Instance',
        instanceDetails: {
          instanceId: 'i-0123456789abcdef0',
          instanceType: 't3.micro',
          tags: [{ key: 'Environment', value: 'Production' }],
        },
      },
      service: {
        serviceName: 'guardduty',
        detectorId: 'det-1',
        action: {
          actionType: 'NETWORK_CONNECTION',
          networkConnectionAction: {
            connectionDirection: 'INBOUND',
            localIpDetails: { ipAddressV4: '10.0.1.25' },
            remoteIpDetails: {
              ipAddressV4: '198.51.100.99',
              country: { countryName: 'Unknown' },
            },
          },
        },
      },
      severity: 8.0,
      createdAt: '2026-08-25T12:00:00Z',
      updatedAt: '2026-08-25T12:05:00Z',
      title: 'SSH brute force attacks against EC2 instance i-0123456789abcdef0',
      description:
        '198.51.100.99 is performing SSH brute force attacks against i-0123456789abcdef0.',
    };

    const normalized = normalizer.normalizeFinding(
      sampleFinding,
      'tenant-fintech-01',
      'env-prod',
      'eu-west-1',
    );

    expect(normalized.tenant_id).toBe('tenant-fintech-01');
    expect(normalized.category_uid).toBe(2); // Findings
    expect(normalized.class_uid).toBe(2001); // Security Finding
    expect(normalized.severity).toBe('HIGH');
    expect(normalized.finding.uid).toBe('gd-find-101');
    expect(normalized.finding.title).toContain('SSH brute force');
    expect(normalized.resources?.[0].uid).toBe('i-0123456789abcdef0');
    expect(normalized.raw_payload_hash).toBeDefined();
  });

  it('rejects connection when roleArn is missing', async () => {
    const res = await provider.connect(
      { tenantId: 'ten-1', environmentId: 'env-1' } as any,
      { awsAccountId: '123456789012' } as any,
    );
    expect(res.status).toBe('FAILED');
    expect(res.error).toContain('roleArn is mandatory');
  });
});
