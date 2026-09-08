import { Test, TestingModule } from '@nestjs/testing';
import { GcpSccProvider } from './gcp-scc.provider';
import { GcpSccNormalizerService } from './gcp-scc.normalizer';
import { ConnectorRegistry } from '../../core/connector-registry';
import { ConnectorContext } from '../../core/connector-context';
import { GcpSccFindingPayload } from './gcp-scc.types';

describe('GcpSccProvider & Normalizer', () => {
  let provider: GcpSccProvider;
  let normalizer: GcpSccNormalizerService;
  let registry: ConnectorRegistry;

  const mockContext: ConnectorContext = {
    connectorInstanceId: 'conn-inst-gcp-1',
    tenantId: 'tenant-gcp-test',
    environmentId: 'env-prod-1',
    region: 'us-central1',
    purpose: 'Cloud Security Ingestion',
    correlationId: 'corr-gcp-1',
    traceId: 'trace-gcp-1',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GcpSccProvider,
        GcpSccNormalizerService,
        {
          provide: ConnectorRegistry,
          useValue: {
            register: jest.fn(),
          },
        },
      ],
    }).compile();

    provider = module.get<GcpSccProvider>(GcpSccProvider);
    normalizer = module.get<GcpSccNormalizerService>(GcpSccNormalizerService);
    registry = module.get<ConnectorRegistry>(ConnectorRegistry);
  });

  describe('Lifecycle & Registry', () => {
    it('registers with ConnectorRegistry on module init', () => {
      provider.onModuleInit();
      expect(registry.register).toHaveBeenCalledWith('gcp-scc', provider);
    });
  });

  describe('Connection & Health', () => {
    it('fails connect if credentials are missing', async () => {
      const result = await provider.connect(mockContext, {
        tenantId: mockContext.tenantId,
        environmentId: mockContext.environmentId,
      });

      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('serviceAccountKey or OAuth credentials mandatory');
    });

    it('successfully connects when serviceAccountKey provided', async () => {
      const result = await provider.connect(mockContext, {
        tenantId: mockContext.tenantId,
        environmentId: mockContext.environmentId,
        serviceAccountKey: '{"type":"service_account"}',
        gcpProjectId: 'zoiko-shield-prod',
      });

      expect(result.status).toBe('CONNECTED');
      expect(result.baseUrl).toBe('https://securitycenter.googleapis.com');
    });

    it('returns healthy status on testConnection', async () => {
      const health = await provider.testConnection(mockContext);
      expect(health.status).toBe('HEALTHY');
      expect(health.latencyMs).toBeLessThan(100);
    });

    it('returns expected permissions', async () => {
      const perms = await provider.getPermissions(mockContext);
      expect(perms.granted).toContain('securitycenter.findings.list');
      expect(perms.missing).toEqual([]);
    });
  });

  describe('OCSF Normalization', () => {
    it('normalizes GCP SCC finding payload into OCSF 1.1.0 Cloud Finding', () => {
      const payload: GcpSccFindingPayload = {
        name: 'organizations/11223344/sources/556677/findings/f-99881',
        parent: 'organizations/11223344/sources/556677',
        resourceName: '//compute.googleapis.com/projects/my-gcp-proj/zones/us-central1-a/instances/prod-vm-01',
        state: 'ACTIVE',
        category: 'PERSISTENCE: IAM_ADMIN_ROLE_ASSIGNED',
        severity: 'CRITICAL',
        eventTime: '2026-09-08T08:30:00.000Z',
        createTime: '2026-09-08T08:30:05.000Z',
        findingClass: 'THREAT',
      };

      const event = normalizer.normalizeFinding(
        payload,
        mockContext.tenantId,
        mockContext.environmentId,
        'us-central1',
      );

      expect(event.metadata.version).toBe('1.1.0');
      expect(event.metadata.product.name).toBe('Google Cloud Security Command Center');
      expect(event.category_uid).toBe(2);
      expect(event.class_uid).toBe(2001);
      expect(event.severity).toBe('CRITICAL');
      expect(event.severity_id).toBe(4);
      expect(event.finding.uid).toBe(payload.name);
      expect(event.cloud?.provider).toBe('GCP');
      expect(event.cloud?.resource_name).toBe(payload.resourceName);
      expect(event.attacks).toHaveLength(1);
      expect(event.attacks?.[0].tactic.name).toBe('PERSISTENCE');
      expect(event.attacks?.[0].technique.name).toBe('IAM_ADMIN_ROLE_ASSIGNED');
      expect(event.raw_payload_hash).toBeDefined();
    });

    it('sync processes batch of GCP SCC findings successfully', async () => {
      const payload: GcpSccFindingPayload = {
        name: 'findings/batch-scc-1',
        parent: 'sources/1',
        resourceName: '//storage.googleapis.com/public-bucket-1',
        state: 'ACTIVE',
        category: 'EXPOSURE: PUBLIC_BUCKET_ACL',
        severity: 'HIGH',
        eventTime: '2026-09-08T08:35:00.000Z',
        createTime: '2026-09-08T08:35:00.000Z',
      };

      const syncResult = await provider.sync(mockContext, [payload]);
      expect(syncResult.status).toBe('SYNCED');
      expect(syncResult.recordsProcessed).toBe(1);
    });
  });
});
