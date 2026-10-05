import { Test, TestingModule } from '@nestjs/testing';
import { PostureDriftDetectorService } from './posture-drift-detector.service';
import { PostureDriftController } from './posture-drift.controller';
import { LiveTelemetryStreamService } from '../streaming/live-telemetry-stream.service';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';

describe('PostureDriftModule Suite', () => {
  let service: PostureDriftDetectorService;
  let controller: PostureDriftController;
  let streamService: LiveTelemetryStreamService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PostureDriftController],
      providers: [PostureDriftDetectorService, LiveTelemetryStreamService],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    service = module.get<PostureDriftDetectorService>(
      PostureDriftDetectorService,
    );
    controller = module.get<PostureDriftController>(PostureDriftController);
    streamService = module.get<LiveTelemetryStreamService>(
      LiveTelemetryStreamService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(controller).toBeDefined();
  });

  describe('PostureDriftDetectorService', () => {
    it('should scan assets and detect critical S3 public exposure and unencrypted bucket drift', async () => {
      const scanResult = await service.scanTenantPosture('tenant-test-bank', [
        {
          assetId: 's3-confidential-docs',
          assetType: 'S3_BUCKET',
          cloudProvider: 'AWS',
          configuration: {
            isPublicRead: true, // violation
            blockPublicAccess: false,
            serverSideEncryption: false, // violation
          },
        },
      ]);

      expect(scanResult.totalAssetsScanned).toBe(1);
      expect(scanResult.driftFindingsCount).toBe(2);
      expect(scanResult.criticalDriftCount).toBe(1);

      const publicExposure = scanResult.findings.find(
        (f) => f.ruleCode === 'DRIFT_STORAGE_PUBLIC_EXPOSURE',
      );
      expect(publicExposure).toBeDefined();
      expect(publicExposure?.severity).toBe('CRITICAL');
      expect(publicExposure?.remediationPlan.forwardAction).toBe(
        'ENABLE_CLOUD_STORAGE_BLOCK_PUBLIC_ACCESS',
      );
      expect(publicExposure?.remediationPlan.blastRadiusScore).toBeLessThan(0.1);
    });

    it('should detect privileged Kubernetes container drift', async () => {
      const scanResult = await service.scanTenantPosture('tenant-test-k8s', [
        {
          assetId: 'pod-api-service',
          assetType: 'K8S_POD',
          cloudProvider: 'KUBERNETES',
          configuration: {
            privileged: true, // violation
            hostPID: true,
          },
        },
      ]);

      expect(scanResult.driftFindingsCount).toBe(1);
      expect(scanResult.findings[0].ruleCode).toBe(
        'DRIFT_K8S_CONTAINER_PRIVILEGED_ESCAPE_RISK',
      );
      expect(scanResult.findings[0].severity).toBe('CRITICAL');
    });

    it('should execute 1-click remediation and update finding status with cryptographic digest', async () => {
      const scan = await service.scanTenantPosture('tenant-remediate-test');
      const firstFinding = scan.findings[0];

      const remediationRes = await service.remediateDriftFinding(
        'tenant-remediate-test',
        firstFinding.findingId,
        'Applied automated least privilege policy under JIT #JIT-2026',
        firstFinding.remediationPlan.requiresDualCustody ? 'approver-lead-sec' : undefined,
      );

      expect(remediationRes.status).toBe('REMEDIATION_EXECUTED');
      expect(remediationRes.findingId).toBe(firstFinding.findingId);
      expect(remediationRes.remediationReceipt.attestationDigest).toBeDefined();

      const updatedFindings = service.getTenantFindings('tenant-remediate-test');
      const updated = updatedFindings.find((f) => f.findingId === firstFinding.findingId);
      expect(updated?.status).toBe('REMEDIATED');
    });

    it('should fail remediation if dual-custody is required but approver is missing', async () => {
      const scan = await service.scanTenantPosture('tenant-dual-custody-test', [
        {
          assetId: 'iam-role-root-admin',
          assetType: 'IAM_POLICY',
          cloudProvider: 'AWS',
          configuration: {
            statement: [{ effect: 'Allow', action: '*' }],
            mfaEnforced: false,
          },
        },
      ]);

      const iamFinding = scan.findings[0];
      expect(iamFinding.remediationPlan.requiresDualCustody).toBe(true);

      await expect(
        service.remediateDriftFinding(
          'tenant-dual-custody-test',
          iamFinding.findingId,
          'Unauthorized single-operator attempt',
        ),
      ).rejects.toThrow('DUAL_CUSTODY_REQUIRED');
    });
  });

  describe('PostureDriftController', () => {
    it('should execute posture scan via POST /api/v1/assurance/posture-drift/scan', async () => {
      const res = await controller.scanPosture({
        tenantId: 'tenant-controller-test',
      });

      expect(res.status).toBe('SCAN_COMPLETED');
      expect(res.totalAssetsScanned).toBeGreaterThan(0);
      expect(res.findings.length).toBeGreaterThan(0);
    });

    it('should retrieve findings via GET /api/v1/assurance/posture-drift/findings', async () => {
      await controller.scanPosture({ tenantId: 'tenant-findings-test' });

      const res = controller.getFindings('tenant-findings-test');
      expect(res.tenantId).toBe('tenant-findings-test');
      expect(res.totalFindings).toBeGreaterThan(0);
    });
  });
});
