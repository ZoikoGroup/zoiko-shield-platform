import { Test, TestingModule } from '@nestjs/testing';
import { AzureMonitorProvider } from './azure-monitor.provider';
import { AzureMonitorNormalizerService } from './azure-monitor.normalizer';
import { ConnectorRegistry } from '../../core/connector-registry';
import { ConnectorContext } from '../../core/connector-context';
import { AzureActivityLogEvent } from './azure-monitor.types';

describe('AzureMonitorProvider & Normalizer', () => {
  let provider: AzureMonitorProvider;
  let normalizer: AzureMonitorNormalizerService;
  let registry: ConnectorRegistry;

  const mockContext: ConnectorContext = {
    connectorInstanceId: 'conn-inst-azure-1',
    tenantId: 'tenant-azure-test',
    environmentId: 'env-prod-1',
    region: 'eu-west-1',
    purpose: 'Cloud Security Ingestion',
    correlationId: 'corr-azure-1',
    traceId: 'trace-azure-1',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AzureMonitorProvider,
        AzureMonitorNormalizerService,
        {
          provide: ConnectorRegistry,
          useValue: {
            register: jest.fn(),
          },
        },
      ],
    }).compile();

    provider = module.get<AzureMonitorProvider>(AzureMonitorProvider);
    normalizer = module.get<AzureMonitorNormalizerService>(
      AzureMonitorNormalizerService,
    );
    registry = module.get<ConnectorRegistry>(ConnectorRegistry);
  });

  describe('Lifecycle & Registry', () => {
    it('registers with ConnectorRegistry on module init', () => {
      provider.onModuleInit();
      expect(registry.register).toHaveBeenCalledWith('azure-monitor', provider);
    });
  });

  describe('Connection & Health', () => {
    it('fails connect if service principal credentials are missing', async () => {
      const result = await provider.connect(mockContext, {
        tenantId: mockContext.tenantId,
        environmentId: mockContext.environmentId,
      });

      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('service principal');
    });

    it('fails connect if subscriptionId is missing', async () => {
      const result = await provider.connect(mockContext, {
        clientId: 'app-client-id',
        clientSecret: 'app-secret',
        azureTenantId: 'aad-tenant-id',
      });

      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('subscriptionId');
    });

    it('successfully connects when full service principal + subscription provided', async () => {
      const result = await provider.connect(mockContext, {
        clientId: 'app-client-id',
        clientSecret: 'app-secret',
        azureTenantId: 'aad-tenant-id',
        subscriptionId: 'sub-00000000',
      });

      expect(result.status).toBe('CONNECTED');
      expect(result.baseUrl).toBe('https://management.azure.com');
      expect(result.subscriptionId).toBe('sub-00000000');
    });

    it('returns healthy status on testConnection', async () => {
      const health = await provider.testConnection(mockContext);
      expect(health.status).toBe('HEALTHY');
      expect(health.latencyMs).toBeLessThan(100);
    });

    it('returns expected permissions', async () => {
      const perms = await provider.getPermissions(mockContext);
      expect(perms.granted).toContain(
        'Microsoft.Insights/eventtypes/values/read',
      );
      expect(perms.missing).toEqual([]);
    });
  });

  describe('OCSF Normalization', () => {
    it('normalizes an Azure Activity Log event into an OCSF cloud audit event', () => {
      const event: AzureActivityLogEvent = {
        eventTimestamp: '2026-09-11T08:30:00.000Z',
        operationName: { value: 'Microsoft.Authorization/roleAssignments/write' },
        category: { value: 'Administrative' },
        level: 'Critical',
        resourceId: '/subscriptions/sub-1/resourceGroups/rg-1',
        subscriptionId: 'sub-00000000',
        caller: 'admin@contoso.com',
        status: { value: 'Succeeded' },
      };

      const normalized = normalizer.normalizeEvent(
        event,
        mockContext.tenantId,
        mockContext.environmentId,
        'eu-west-1',
      );

      expect(normalized.metadata.version).toBe('1.1.0');
      expect(normalized.metadata.product.vendor_name).toBe('Microsoft');
      expect(normalized.severity).toBe('CRITICAL');
      expect(normalized.severity_id).toBe(4);
      expect(normalized.actor.user).toBe('admin@contoso.com');
      expect(normalized.cloud.provider).toBe('Azure');
      expect(normalized.cloud.subscription_id).toBe('sub-00000000');
      expect(normalized.action).toBe(
        'Microsoft.Authorization/roleAssignments/write',
      );
      expect(normalized.outcome).toBe('SUCCESS');
      expect(normalized.raw_payload_hash).toBeDefined();
    });

    it('maps a failed operation to outcome FAILED', () => {
      const event: AzureActivityLogEvent = {
        eventTimestamp: '2026-09-11T08:31:00.000Z',
        operationName: { value: 'Microsoft.Compute/virtualMachines/delete' },
        category: { value: 'Administrative' },
        level: 'Warning',
        subscriptionId: 'sub-00000000',
        status: { value: 'Failed' },
      };

      const normalized = normalizer.normalizeEvent(
        event,
        mockContext.tenantId,
        mockContext.environmentId,
      );

      expect(normalized.outcome).toBe('FAILED');
      expect(normalized.severity).toBe('MEDIUM');
    });

    it('sync processes a batch of Activity Log events successfully', async () => {
      const event: AzureActivityLogEvent = {
        eventTimestamp: '2026-09-11T08:32:00.000Z',
        operationName: { value: 'Microsoft.Storage/storageAccounts/write' },
        category: { value: 'Administrative' },
        level: 'Informational',
        subscriptionId: 'sub-00000000',
        status: { value: 'Succeeded' },
      };

      const syncResult = await provider.sync(mockContext, [event]);
      expect(syncResult.status).toBe('SYNCED');
      expect(syncResult.recordsProcessed).toBe(1);
    });
  });
});
