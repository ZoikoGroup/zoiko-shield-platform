import { Test, TestingModule } from '@nestjs/testing';
import { ConnectorsProxyController } from './connectors-proxy.controller';
import { ShieldIngestClient } from '../../internal-client/shield-ingest.client';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';

describe('ConnectorsProxyController', () => {
  let controller: ConnectorsProxyController;
  let mockShieldIngestClient: Partial<ShieldIngestClient>;

  const mockUser: AuthenticatedUser = {
    id: 'usr-analyst-123',
    sessionId: 'sess-123',
    email: 'analyst@zoiko.com',
    emailVerified: true,
    assurance: 'FEDERATED_MFA',
    tenantId: 'tenant-demo-456',
    membershipId: 'mem-123',
    environmentId: 'production',
    region: 'us-east-1',
    policyVersion: 'v1.0',
    riskState: 'LOW',
    sessionState: 'ACTIVE',
  };

  beforeEach(async () => {
    mockShieldIngestClient = {
      getConnectorTypes: jest.fn().mockResolvedValue([
        { type: 'GENERIC_WEBHOOK', name: 'Generic Webhook' },
        { type: 'CROWDSTRIKE_FALCON', name: 'CrowdStrike Falcon' },
      ]),
      listConnectors: jest
        .fn()
        .mockResolvedValue([
          { id: 'conn-1', tenantId: 'tenant-demo-456', status: 'ACTIVE' },
        ]),
      createConnector: jest.fn().mockImplementation((tenantId, dto) =>
        Promise.resolve({
          id: 'conn-new',
          tenantId,
          ...dto,
          status: 'CREATED',
        }),
      ),
      getConnector: jest
        .fn()
        .mockImplementation((tenantId, id) =>
          Promise.resolve({ id, tenantId, status: 'ACTIVE' }),
        ),
      updateConnector: jest
        .fn()
        .mockImplementation((tenantId, id, dto) =>
          Promise.resolve({ id, tenantId, ...dto }),
        ),
      deleteConnector: jest.fn().mockResolvedValue({ success: true }),
      testConnector: jest
        .fn()
        .mockResolvedValue({ success: true, latencyMs: 42 }),
      syncConnector: jest
        .fn()
        .mockResolvedValue({ status: 'SYNCED', count: 100 }),
      getConnectorHealth: jest
        .fn()
        .mockResolvedValue({ healthStatus: 'HEALTHY' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConnectorsProxyController],
      providers: [
        {
          provide: ShieldIngestClient,
          useValue: mockShieldIngestClient,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ConnectorsProxyController>(
      ConnectorsProxyController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should list connector types without requiring tenantId', async () => {
    const types = await controller.getConnectorTypes();
    expect(types).toHaveLength(2);
    expect(mockShieldIngestClient.getConnectorTypes).toHaveBeenCalled();
  });

  it('should list connectors using tenantId from header or user context', async () => {
    const connectors = await controller.listConnectors(
      'tenant-demo-456',
      mockUser,
    );
    expect(connectors).toHaveLength(1);
    expect(mockShieldIngestClient.listConnectors).toHaveBeenCalledWith(
      'tenant-demo-456',
    );
  });

  it('should create a connector scoped to the tenant', async () => {
    const newConn = await controller.createConnector(
      'tenant-demo-456',
      mockUser,
      { provider: 'GENERIC_WEBHOOK', name: 'My Webhook' },
    );
    expect(newConn.id).toBe('conn-new');
    expect(mockShieldIngestClient.createConnector).toHaveBeenCalledWith(
      'tenant-demo-456',
      { provider: 'GENERIC_WEBHOOK', name: 'My Webhook' },
    );
  });

  it('should test and evaluate connector health', async () => {
    const health = await controller.getConnectorHealth(
      'tenant-demo-456',
      mockUser,
      'conn-1',
    );
    expect(health.healthStatus).toBe('HEALTHY');
    expect(mockShieldIngestClient.getConnectorHealth).toHaveBeenCalledWith(
      'tenant-demo-456',
      'conn-1',
    );
  });
});
