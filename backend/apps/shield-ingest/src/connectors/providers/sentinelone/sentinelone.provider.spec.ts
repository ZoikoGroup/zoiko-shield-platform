import { Test, TestingModule } from '@nestjs/testing';
import { SentinelOneProvider } from './sentinelone.provider';
import { SentinelOneNormalizerService } from './sentinelone.normalizer';
import { SentinelOneThreatPayload } from './sentinelone.types';

describe('SentinelOneProvider', () => {
  let provider: SentinelOneProvider;
  let normalizer: SentinelOneNormalizerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SentinelOneProvider, SentinelOneNormalizerService],
    }).compile();

    provider = module.get<SentinelOneProvider>(SentinelOneProvider);
    normalizer = module.get<SentinelOneNormalizerService>(
      SentinelOneNormalizerService,
    );
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
    expect(normalizer).toBeDefined();
  });

  it('should connect and test connection successfully', async () => {
    const mockContext = {
      connectorInstanceId: 'conn-s1-1',
      tenantId: 'tenant-1',
      environmentId: 'env-prod',
      region: 'us-east-1',
      purpose: 'SECURITY_MONITORING',
      correlationId: 'corr-1',
      traceId: 'trace-1',
    };

    const connResult = await provider.connect(mockContext, {
      apiUrl: 'https://test.sentinelone.net',
    });
    expect(connResult.status).toBe('CONNECTED');

    const health = await provider.testConnection(mockContext);
    expect(health.status).toBe('HEALTHY');
  });

  it('should handle SentinelOne threat webhook and normalize into OCSF finding', async () => {
    const mockThreatPayload: SentinelOneThreatPayload = {
      id: 'threat-12345',
      agentDetectionInfo: {
        agentId: 'agent-s1-001',
        agentComputerName: 'fin-srv-01',
        agentIp: '10.0.4.15',
        agentOsName: 'Windows Server 2022',
        agentVersion: '23.2.1',
        networkStatus: 'connected',
      },
      threatInfo: {
        threatId: 's1-th-999',
        threatName: 'Ransomware.LockBit',
        classification: 'RANSOMWARE',
        confidenceScore: 95,
        incidentStatus: 'unresolved',
        mitigationStatus: 'not_mitigated',
        createdAt: '2026-08-26T08:00:00.000Z',
        filePath: 'C:\\Windows\\Temp\\payload.exe',
        processUser: 'NT AUTHORITY\\SYSTEM',
        commandLine: 'payload.exe -k -s',
        sha256:
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      },
      indicators: [
        {
          category: 'Ransomware Activity',
          description: 'High entropy file writes detected',
          tactics: [{ name: 'Impact', source: 'MITRE' }],
          techniques: [
            {
              name: 'Data Encrypted for Impact',
              link: 'https://attack.mitre.org/techniques/T1486/',
            },
          ],
        },
      ],
    };

    const webhookContext = {
      connectorInstanceId: 'conn-s1-primary',
      tenantId: 'tenant-enterprise',
      environmentId: 'env-production',
      region: 'us-east-1',
      purpose: 'SECURITY_MONITORING',
      correlationId: 'corr-primary',
      traceId: 'trace-primary',
    };

    const response = await provider.handleWebhook(
      mockThreatPayload,
      webhookContext,
    );

    expect(response.success).toBe(true);
    expect(response.event).toBeDefined();
    expect(response.event.category_uid).toBe(2);
    expect(response.event.class_uid).toBe(2001);
    expect(response.event.severity).toBe('CRITICAL');
    expect(response.event.finding.title).toBe('Ransomware.LockBit');
    expect(response.event.device.hostname).toBe('fin-srv-01');
    expect(response.event.process?.file.hashes[0].value).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(response.event.attacks?.[0].technique.name).toBe(
      'Data Encrypted for Impact',
    );
  });
});
