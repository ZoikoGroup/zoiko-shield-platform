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

  it('forwards the normalized event list for the caller tenant with a bounded limit', async () => {
    const listEvents = jest.fn().mockResolvedValue({ data: [] });
    (controller as any).shieldIngestClient.listEvents = listEvents;

    await controller.listEvents('tenant-demo-456', mockUser, '5000');

    expect(listEvents).toHaveBeenCalledWith('tenant-demo-456', { limit: '500' });
  });

  it('refuses an events request whose header names another tenant', async () => {
    (controller as any).shieldIngestClient.listEvents = jest.fn();
    await expect(controller.listEvents('tenant-other', mockUser)).rejects.toThrow(
      'Conflicting tenant identifiers were supplied',
    );
  });

  it('forwards control evaluations for the caller tenant', async () => {
    const listControlEvaluations = jest.fn().mockResolvedValue([]);
    (controller as any).shieldIngestClient.listControlEvaluations = listControlEvaluations;

    await controller.listControlEvaluations('tenant-demo-456', mockUser);

    expect(listControlEvaluations).toHaveBeenCalledWith('tenant-demo-456');
  });

  it('forwards a single normalized event lookup for the caller tenant', async () => {
    const getEventById = jest.fn().mockResolvedValue({ id: 'evt-1' });
    (controller as any).shieldIngestClient.getEventById = getEventById;

    await controller.getEventById('tenant-demo-456', mockUser, 'evt-1');

    expect(getEventById).toHaveBeenCalledWith('tenant-demo-456', 'evt-1');
  });

  it('refuses a single-event request whose header names another tenant', async () => {
    (controller as any).shieldIngestClient.getEventById = jest.fn();
    await expect(controller.getEventById('tenant-other', mockUser, 'evt-1')).rejects.toThrow(
      'Conflicting tenant identifiers were supplied',
    );
  });

  it('forwards DLQ metrics for the caller tenant', async () => {
    const getDlqMetrics = jest.fn().mockResolvedValue({ totalQuarantined: 0 });
    (controller as any).shieldIngestClient.getDlqMetrics = getDlqMetrics;

    await controller.getDlqMetrics('tenant-demo-456', mockUser);

    expect(getDlqMetrics).toHaveBeenCalledWith('tenant-demo-456');
  });

  it('forwards the quarantine list for the caller tenant with an optional limit', async () => {
    const listQuarantinedEvents = jest.fn().mockResolvedValue({ data: [] });
    (controller as any).shieldIngestClient.listQuarantinedEvents = listQuarantinedEvents;

    await controller.listQuarantinedEvents('tenant-demo-456', mockUser, '25');

    expect(listQuarantinedEvents).toHaveBeenCalledWith('tenant-demo-456', { limit: '25' });
  });

  it('refuses a quarantine-list request whose header names another tenant', async () => {
    (controller as any).shieldIngestClient.listQuarantinedEvents = jest.fn();
    await expect(controller.listQuarantinedEvents('tenant-other', mockUser)).rejects.toThrow(
      'Conflicting tenant identifiers were supplied',
    );
  });

  it('forwards a quarantine reprocess request for the caller tenant', async () => {
    const reprocessQuarantinedEvent = jest.fn().mockResolvedValue({ message: 'Quarantine reprocessed' });
    (controller as any).shieldIngestClient.reprocessQuarantinedEvent = reprocessQuarantinedEvent;

    await controller.reprocessQuarantinedEvent('tenant-demo-456', mockUser, 'q-1');

    expect(reprocessQuarantinedEvent).toHaveBeenCalledWith('tenant-demo-456', 'q-1');
  });

  it('forwards a DLQ auto-retry sweep for the caller tenant with an optional limit', async () => {
    const triggerDlqAutoRetry = jest.fn().mockResolvedValue({ message: 'Automated DLQ retry sweep executed' });
    (controller as any).shieldIngestClient.triggerDlqAutoRetry = triggerDlqAutoRetry;

    await controller.triggerDlqAutoRetry('tenant-demo-456', mockUser, '10');

    expect(triggerDlqAutoRetry).toHaveBeenCalledWith('tenant-demo-456', 10);
  });

  it('refuses a DLQ auto-retry request whose header names another tenant', async () => {
    (controller as any).shieldIngestClient.triggerDlqAutoRetry = jest.fn();
    await expect(controller.triggerDlqAutoRetry('tenant-other', mockUser)).rejects.toThrow(
      'Conflicting tenant identifiers were supplied',
    );
  });

  it('forwards a control test evaluation for the caller tenant', async () => {
    const evaluateControl = jest.fn().mockResolvedValue({ result: 'PASS' });
    (controller as any).shieldIngestClient.evaluateControl = evaluateControl;

    await controller.evaluateControl('tenant-demo-456', mockUser, 'ctrl-1', { note: 'x' });

    expect(evaluateControl).toHaveBeenCalledWith('tenant-demo-456', 'ctrl-1', { note: 'x' });
  });

  it('forwards assurance posture, reviews and reflections for the caller tenant', async () => {
    const getAssurancePosture = jest.fn().mockResolvedValue({});
    const listAssuranceReviews = jest.fn().mockResolvedValue([]);
    const createAssuranceReview = jest.fn().mockResolvedValue({ id: 'rev-1' });
    const listAssuranceReflections = jest.fn().mockResolvedValue([]);
    const createAssuranceReflection = jest.fn().mockResolvedValue({ id: 'ref-1' });
    Object.assign(controller as any, {
      shieldIngestClient: {
        getAssurancePosture,
        listAssuranceReviews,
        createAssuranceReview,
        listAssuranceReflections,
        createAssuranceReflection,
      },
    });

    await controller.getAssurancePosture('tenant-demo-456', mockUser);
    await controller.listAssuranceReviews('tenant-demo-456', mockUser);
    await controller.createAssuranceReview('tenant-demo-456', mockUser, { periodName: 'Q1' });
    await controller.listAssuranceReflections('tenant-demo-456', mockUser, 'rev-1');
    await controller.createAssuranceReflection('tenant-demo-456', mockUser, { title: 't' });

    expect(getAssurancePosture).toHaveBeenCalledWith('tenant-demo-456');
    expect(listAssuranceReviews).toHaveBeenCalledWith('tenant-demo-456');
    expect(createAssuranceReview).toHaveBeenCalledWith('tenant-demo-456', { periodName: 'Q1' });
    expect(listAssuranceReflections).toHaveBeenCalledWith('tenant-demo-456', 'rev-1');
    expect(createAssuranceReflection).toHaveBeenCalledWith('tenant-demo-456', { title: 't' });
  });

  it('forwards SLA claim evaluation, history and performance for the caller tenant', async () => {
    const evaluateSlaClaim = jest.fn().mockResolvedValue({ met: true });
    const listSlaClaimEvaluations = jest.fn().mockResolvedValue([]);
    const getSlaPerformance = jest.fn().mockResolvedValue({});
    Object.assign(controller as any, {
      shieldIngestClient: { evaluateSlaClaim, listSlaClaimEvaluations, getSlaPerformance },
    });

    await controller.evaluateSlaClaim('tenant-demo-456', mockUser, { claimKey: 'CLAIM_15MIN_RESPONSE' });
    await controller.listSlaClaimEvaluations('tenant-demo-456', mockUser, 'CLAIM_15MIN_RESPONSE');
    await controller.getSlaPerformance('tenant-demo-456', mockUser);

    expect(evaluateSlaClaim).toHaveBeenCalledWith('tenant-demo-456', { claimKey: 'CLAIM_15MIN_RESPONSE' });
    expect(listSlaClaimEvaluations).toHaveBeenCalledWith('tenant-demo-456', 'CLAIM_15MIN_RESPONSE');
    expect(getSlaPerformance).toHaveBeenCalledWith('tenant-demo-456');
  });

  it('forwards metering usage and resources for the caller tenant', async () => {
    const getMeteringUsage = jest.fn().mockResolvedValue({});
    const getMeteringResources = jest.fn().mockResolvedValue({});
    Object.assign(controller as any, {
      shieldIngestClient: { getMeteringUsage, getMeteringResources },
    });

    await controller.getMeteringUsage('tenant-demo-456', mockUser);
    await controller.getMeteringResources('tenant-demo-456', mockUser);

    expect(getMeteringUsage).toHaveBeenCalledWith('tenant-demo-456');
    expect(getMeteringResources).toHaveBeenCalledWith('tenant-demo-456');
  });

  it('never defines GET or POST api/v1/controls here (it belongs to ControlsController)', () => {
    const proto = Object.getPrototypeOf(controller);
    const methodNames = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor');
    for (const name of methodNames) {
      const metaPath: string | string[] | undefined = Reflect.getMetadata('path', proto[name]);
      const paths = Array.isArray(metaPath) ? metaPath : [metaPath];
      expect(paths).not.toContain('controls');
    }
  });
});
