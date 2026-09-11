import { Test, TestingModule } from '@nestjs/testing';
import {
  ConnectorPermissionDriftService,
  P0_CONNECTOR_BASELINES,
} from './connector-permission-drift.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  KafkaProducerService,
  CANONICAL_TOPICS,
} from '../kafka/kafka.producer.service';
import { ConnectorHealthService } from '../connectors/services/health.service';
import { PermissionService } from '../connectors/services/permission.service';

describe('ConnectorPermissionDriftService', () => {
  let service: ConnectorPermissionDriftService;
  let prismaMock: any;
  let kafkaMock: any;
  let healthMock: any;
  let permissionMock: any;

  beforeEach(async () => {
    prismaMock = {
      connectorInstance: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    kafkaMock = {
      publishEvent: jest.fn().mockResolvedValue(undefined),
    };

    healthMock = {
      updateHealth: jest.fn().mockResolvedValue(undefined),
      updatePermissionStatus: jest.fn().mockResolvedValue(undefined),
    };

    permissionMock = {
      declareRequired: jest.fn().mockResolvedValue(undefined),
      reconcileGranted: jest.fn().mockResolvedValue({ newlyMissing: [] }),
      getGranted: jest.fn().mockResolvedValue([]),
      getMissingRequired: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectorPermissionDriftService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: KafkaProducerService, useValue: kafkaMock },
        { provide: ConnectorHealthService, useValue: healthMock },
        { provide: PermissionService, useValue: permissionMock },
      ],
    }).compile();

    service = module.get<ConnectorPermissionDriftService>(
      ConnectorPermissionDriftService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('evaluateInstanceDrift', () => {
    it('should return ALIGNED when all required permissions are actively granted', async () => {
      const instanceId = 'inst-entra-01';
      const tenantId = 'tenant-acme';
      const provider = 'microsoft-entra';
      const granted = [
        'AuditLog.Read.All',
        'Directory.Read.All',
        'SecurityEvents.Read.All',
      ];

      const result = await service.evaluateInstanceDrift(
        instanceId,
        tenantId,
        provider,
        granted,
      );

      expect(result.driftStatus).toBe('ALIGNED');
      expect(result.missingPermissions).toHaveLength(0);
      expect(result.hasCriticalLoss).toBe(false);
      expect(healthMock.updatePermissionStatus).toHaveBeenCalledWith(
        instanceId,
        tenantId,
        'OK',
      );
      expect(healthMock.updateHealth).not.toHaveBeenCalled();
    });

    it('should return DEGRADED when non-critical permissions are lost', async () => {
      const instanceId = 'inst-entra-02';
      const tenantId = 'tenant-acme';
      const provider = 'microsoft-entra';
      // Directory.Read.All is missing (not in criticalScopes: ['AuditLog.Read.All', 'SecurityEvents.Read.All'])
      const granted = ['AuditLog.Read.All', 'SecurityEvents.Read.All'];

      const result = await service.evaluateInstanceDrift(
        instanceId,
        tenantId,
        provider,
        granted,
      );

      expect(result.driftStatus).toBe('DEGRADED');
      expect(result.missingPermissions).toContain('Directory.Read.All');
      expect(result.hasCriticalLoss).toBe(false);
      expect(healthMock.updatePermissionStatus).toHaveBeenCalledWith(
        instanceId,
        tenantId,
        'DEGRADED',
      );
      expect(kafkaMock.publishEvent).toHaveBeenCalledWith(
        CANONICAL_TOPICS.CONNECTOR_PERMISSION_CHANGED,
        'connector.permission.drift_detected',
        expect.objectContaining({
          tenantId,
          instanceId,
          driftStatus: 'DEGRADED',
        }),
      );
      expect(healthMock.updateHealth).not.toHaveBeenCalled();
    });

    it('should return REVOKED and degrade connector health when critical scopes are missing', async () => {
      const instanceId = 'inst-aws-01';
      const tenantId = 'tenant-acme';
      const provider = 'aws-cloudtrail';
      // cloudtrail:LookupEvents is critical for aws-cloudtrail
      const granted = ['guardduty:GetFindings'];

      const result = await service.evaluateInstanceDrift(
        instanceId,
        tenantId,
        provider,
        granted,
      );

      expect(result.driftStatus).toBe('REVOKED');
      expect(result.hasCriticalLoss).toBe(true);
      expect(result.missingPermissions).toContain('cloudtrail:LookupEvents');
      expect(result.missingPermissions).toContain('s3:GetObject');
      expect(healthMock.updateHealth).toHaveBeenCalledWith(
        instanceId,
        tenantId,
        'DEGRADED',
        expect.stringContaining('Critical permissions lost'),
      );
      expect(kafkaMock.publishEvent).toHaveBeenCalledWith(
        CANONICAL_TOPICS.CONNECTOR_PERMISSION_CHANGED,
        'connector.permission.drift_detected',
        expect.objectContaining({
          hasCriticalLoss: true,
          driftStatus: 'REVOKED',
        }),
      );
    });

    it('should evaluate crowdstrike drift and detect critical detections:read loss', async () => {
      const instanceId = 'inst-cs-01';
      const tenantId = 'tenant-acme';
      const provider = 'crowdstrike';
      // Missing 'detections:read' which is in criticalScopes: ['alerts:read', 'detections:read']
      const granted = ['alerts:read', 'devices:read'];

      const result = await service.evaluateInstanceDrift(
        instanceId,
        tenantId,
        provider,
        granted,
      );

      expect(result.driftStatus).toBe('REVOKED');
      expect(result.hasCriticalLoss).toBe(true);
      expect(result.missingPermissions).toEqual(['detections:read']);
    });

    it('should evaluate github drift as DEGRADED when audit_log:read is missing but security_events:read is granted', async () => {
      const instanceId = 'inst-gh-01';
      const tenantId = 'tenant-acme';
      const provider = 'github';
      // Missing 'audit_log:read' which is non-critical (critical is 'security_events:read')
      const granted = ['repo:status', 'security_events:read'];

      const result = await service.evaluateInstanceDrift(
        instanceId,
        tenantId,
        provider,
        granted,
      );

      expect(result.driftStatus).toBe('DEGRADED');
      expect(result.hasCriticalLoss).toBe(false);
      expect(result.missingPermissions).toEqual(['audit_log:read']);
    });
  });

  describe('sweepPermissionDrift', () => {
    it('should iterate active connectors and evaluate drift', async () => {
      prismaMock.connectorInstance.findMany.mockResolvedValue([
        {
          id: 'conn-1',
          tenant_id: 'tenant-1',
          type: 'cortex-xdr',
          state: 'HEALTHY',
        },
      ]);
      permissionMock.getGranted.mockResolvedValue([
        'investigation:read',
        'alerts:read',
        'endpoint:read',
      ]);

      await service.sweepPermissionDrift();

      expect(prismaMock.connectorInstance.findMany).toHaveBeenCalled();
      expect(permissionMock.getGranted).toHaveBeenCalledWith('conn-1');
      expect(healthMock.updatePermissionStatus).toHaveBeenCalledWith(
        'conn-1',
        'tenant-1',
        'OK',
      );
    });
  });
});
