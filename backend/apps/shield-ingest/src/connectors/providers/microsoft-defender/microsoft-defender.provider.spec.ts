import { Test, TestingModule } from '@nestjs/testing';
import { MicrosoftDefenderProvider } from './microsoft-defender.provider';
import { MicrosoftDefenderNormalizerService } from './microsoft-defender.normalizer';
import { ConnectorRegistry } from '../../core/connector-registry';
import { ConnectorContext } from '../../core/connector-context';
import { MicrosoftDefenderAlertPayload } from './microsoft-defender.types';

describe('MicrosoftDefenderProvider & Normalizer', () => {
  let provider: MicrosoftDefenderProvider;
  let normalizer: MicrosoftDefenderNormalizerService;
  let registry: ConnectorRegistry;

  const mockContext: ConnectorContext = {
    connectorInstanceId: 'conn-inst-def-1',
    tenantId: 'tenant-defender-test',
    environmentId: 'env-prod-1',
    region: 'GLOBAL',
    purpose: 'EDR Ingestion',
    correlationId: 'corr-def-1',
    traceId: 'trace-def-1',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MicrosoftDefenderProvider,
        MicrosoftDefenderNormalizerService,
        {
          provide: ConnectorRegistry,
          useValue: {
            register: jest.fn(),
          },
        },
      ],
    }).compile();

    provider = module.get<MicrosoftDefenderProvider>(MicrosoftDefenderProvider);
    normalizer = module.get<MicrosoftDefenderNormalizerService>(
      MicrosoftDefenderNormalizerService,
    );
    registry = module.get<ConnectorRegistry>(ConnectorRegistry);
  });

  describe('Lifecycle & Registry', () => {
    it('registers with ConnectorRegistry on module init', () => {
      provider.onModuleInit();
      expect(registry.register).toHaveBeenCalledWith(
        'microsoft-defender-edr',
        provider,
      );
    });
  });

  describe('Connection & Health', () => {
    it('fails connect if credentials are missing', async () => {
      const result = await provider.connect(mockContext, {
        tenantId: mockContext.tenantId,
        environmentId: mockContext.environmentId,
      });

      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('clientId and clientSecret are mandatory');
    });

    it('successfully connects when credentials provided', async () => {
      const result = await provider.connect(mockContext, {
        tenantId: mockContext.tenantId,
        environmentId: mockContext.environmentId,
        clientId: 'azure-app-client-id',
        clientSecret: 'super-secret-key',
      });

      expect(result.status).toBe('CONNECTED');
      expect(result.baseUrl).toBe('https://api.securitycenter.microsoft.com');
    });

    it('returns healthy status on testConnection', async () => {
      const health = await provider.testConnection(mockContext);
      expect(health.status).toBe('HEALTHY');
      expect(health.latencyMs).toBeLessThan(100);
    });

    it('returns expected permissions', async () => {
      const perms = await provider.getPermissions(mockContext);
      expect(perms.granted).toContain('Alert.Read.All');
      expect(perms.missing).toEqual([]);
    });
  });

  describe('OCSF Normalization', () => {
    it('normalizes Microsoft Defender alert payload into OCSF 1.1.0 Security Finding', () => {
      const payload: MicrosoftDefenderAlertPayload = {
        id: 'da63765100000000000',
        incidentId: 4410,
        title: 'Suspicious PowerShell command line executed',
        description:
          'PowerShell downloaded an encoded script from an external IP',
        severity: 'High',
        status: 'New',
        category: 'Execution',
        mitreTechniques: ['T1059.001', 'T1105'],
        alertCreationTime: '2026-09-08T08:00:00.000Z',
        computerDnsName: 'WIN-SRV-CORP-01',
        machineId: 'mach-9921',
        loggedOnUsers: [{ accountName: 'sec_admin', domainName: 'CORP' }],
      };

      const event = normalizer.normalizeAlert(
        payload,
        mockContext.tenantId,
        mockContext.environmentId,
        'GLOBAL',
      );

      expect(event.metadata.version).toBe('1.1.0');
      expect(event.metadata.product.name).toBe(
        'Microsoft Defender for Endpoint',
      );
      expect(event.category_uid).toBe(2);
      expect(event.class_uid).toBe(2001);
      expect(event.severity).toBe('HIGH');
      expect(event.severity_id).toBe(4);
      expect(event.finding.uid).toBe('da63765100000000000');
      expect(event.finding.title).toBe(
        'Suspicious PowerShell command line executed',
      );
      expect(event.device?.hostname).toBe('WIN-SRV-CORP-01');
      expect(event.actor?.user?.name).toBe('sec_admin');
      expect(event.actor?.user?.domain).toBe('CORP');
      expect(event.attacks).toHaveLength(2);
      expect(event.attacks?.[0].technique.name).toBe('T1059.001');
      expect(event.raw_payload_hash).toBeDefined();
    });

    it('sync processes batch of alerts successfully', async () => {
      const payload: MicrosoftDefenderAlertPayload = {
        id: 'alert-batch-1',
        title: 'Mimikatz detected in memory',
        description: 'LSASS process memory was dumped',
        severity: 'High',
        status: 'New',
        category: 'CredentialAccess',
        alertCreationTime: '2026-09-08T08:15:00.000Z',
      };

      const syncResult = await provider.sync(mockContext, [payload]);
      expect(syncResult.status).toBe('SYNCED');
      expect(syncResult.recordsProcessed).toBe(1);
    });
  });
});
