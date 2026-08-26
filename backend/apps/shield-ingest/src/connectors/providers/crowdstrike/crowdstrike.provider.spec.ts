import { Test, TestingModule } from '@nestjs/testing';
import { CrowdStrikeProvider } from './crowdstrike.provider';
import { CrowdStrikeNormalizerService } from './crowdstrike.normalizer';
import { CrowdStrikeDetectionPayload } from './crowdstrike.types';

describe('CrowdStrikeProvider & Normalizer', () => {
  let provider: CrowdStrikeProvider;
  let normalizer: CrowdStrikeNormalizerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CrowdStrikeProvider, CrowdStrikeNormalizerService],
    }).compile();

    provider = module.get<CrowdStrikeProvider>(CrowdStrikeProvider);
    normalizer = module.get<CrowdStrikeNormalizerService>(
      CrowdStrikeNormalizerService,
    );
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
    expect(normalizer).toBeDefined();
  });

  it('normalizes CrowdStrike Falcon PowerShell execution detection', () => {
    const sampleDetection: CrowdStrikeDetectionPayload = {
      detection_id: 'cs-det-999',
      created_timestamp: '2026-08-25T13:00:00Z',
      device: {
        device_id: 'dev-win-01',
        hostname: 'finance-workstation-05',
        local_ip: '10.0.4.15',
        os_version: 'Windows 11 Enterprise',
        containment_status: 'normal',
      },
      behaviors: [
        {
          scenario: 'suspicious_execution',
          objective: 'Defense Evasion',
          tactic: 'Defense Evasion',
          technique: 'Obfuscated Files or Information',
          pattern_id: 10042,
          severity: 4,
          confidence: 90,
          timestamp: '2026-08-25T13:00:00Z',
          cmdline: 'powershell.exe -enc SQBFAFgA...',
          filename: 'powershell.exe',
          sha256:
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          user_name: 'corp\\finance_analyst',
        },
      ],
      status: 'new',
      max_severity: 4,
      max_confidence: 90,
    };

    const normalized = normalizer.normalizeDetection(
      sampleDetection,
      'tenant-fin-01',
      'env-prod',
      'us-east-1',
    );

    expect(normalized.tenant_id).toBe('tenant-fin-01');
    expect(normalized.category_uid).toBe(1); // System Activity
    expect(normalized.class_uid).toBe(1007); // Process Activity
    expect(normalized.severity).toBe('CRITICAL');
    expect(normalized.device.hostname).toBe('finance-workstation-05');
    expect(normalized.process.name).toBe('powershell.exe');
    expect(normalized.process.file.hashes[0].value).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(normalized.attacks?.[0].tactic.name).toBe('Defense Evasion');
    expect(normalized.raw_payload_hash).toBeDefined();
  });

  it('rejects connection when clientSecret is missing', async () => {
    const res = await provider.connect(
      { tenantId: 'ten-1', environmentId: 'env-1' } as any,
      { clientId: 'cs_client_123' } as any,
    );
    expect(res.status).toBe('FAILED');
    expect(res.error).toContain('clientSecret are mandatory');
  });
});
