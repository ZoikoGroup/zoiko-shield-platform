import { Test, TestingModule } from '@nestjs/testing';
import { JiraTicketingProvider } from './jira-ticketing.provider';
import { JiraNormalizerService } from './jira-ticketing.normalizer';
import { ConnectorRegistry } from '../../core/connector-registry';
import { ConnectorContext } from '../../core/connector-context';

describe('JiraTicketingProvider', () => {
  let provider: JiraTicketingProvider;
  let registry: ConnectorRegistry;

  const mockContext: ConnectorContext = {
    connectorInstanceId: 'conn-inst-jira-1',
    tenantId: 'tenant-jira-01',
    environmentId: 'prod',
    region: 'GLOBAL',
    purpose: 'Ticketing Ingestion',
    correlationId: 'corr-jira-01',
    traceId: 'trace-jira-01',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JiraTicketingProvider,
        JiraNormalizerService,
        {
          provide: ConnectorRegistry,
          useValue: {
            register: jest.fn(),
          },
        },
      ],
    }).compile();

    provider = module.get<JiraTicketingProvider>(JiraTicketingProvider);
    registry = module.get<ConnectorRegistry>(ConnectorRegistry);
  });

  it('should register with connector registry onModuleInit', () => {
    provider.onModuleInit();
    expect(registry.register).toHaveBeenCalledWith('jira-ticketing', provider);
  });

  it('should connect successfully with valid hostUrl and apiToken', async () => {
    const res = await provider.connect(mockContext, {
      apiToken: 'jira-test-api-token',
      userEmail: 'secops@zoikogroup.com',
      hostUrl: 'https://zoikogroup.atlassian.net',
    });
    expect(res.status).toBe('CONNECTED');
    expect(res.hostUrl).toBe('https://zoikogroup.atlassian.net');
  });

  it('should reject connection if required fields are missing', async () => {
    const res = await provider.connect(mockContext, {
      apiToken: 'token-only',
    });
    expect(res.status).toBe('FAILED');
    expect(res.error).toBeDefined();
  });

  it('should normalize and sync Jira issues into OCSF incident finding events', async () => {
    const syncRes = await provider.sync(mockContext, [
      {
        id: '10042',
        key: 'SEC-101',
        summary: 'Suspicious privilege escalation observed on Host-09',
        description: 'Multiple failed sudo attempts followed by root session',
        issue_type: 'Incident',
        priority: 'High',
        status: 'In Progress',
        assignee_email: 'analyst@zoikogroup.com',
        created: '2026-09-10T10:00:00Z',
        project_key: 'SEC',
      },
    ]);

    expect(syncRes.status).toBe('SYNCED');
    expect(syncRes.recordsProcessed).toBe(1);
  });
});
