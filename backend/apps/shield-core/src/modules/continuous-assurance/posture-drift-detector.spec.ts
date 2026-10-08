import { Test, TestingModule } from '@nestjs/testing';
import { PostureDriftDetectorService } from './posture-drift-detector.service';
import { PostureDriftController } from './posture-drift.controller';
import { LiveTelemetryStreamService } from '../streaming/live-telemetry-stream.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';

/**
 * In-memory stand-in for the postureDriftFinding Prisma delegate, same
 * shape as a real row set: deleteMany/createMany replace a tenant's
 * findings wholesale (what a rescan does), findUnique/update operate on a
 * single row by id.
 */
function createFakePostureDriftPrisma() {
  let rows: any[] = [];
  return {
    postureDriftFinding: {
      deleteMany: async ({ where }: any) => {
        const before = rows.length;
        rows = rows.filter((r) => r.tenantId !== where.tenantId);
        return { count: before - rows.length };
      },
      createMany: async ({ data }: any) => {
        const created = (data as any[]).map((d) => ({
          ...d,
          remediationReceipt: null,
          updatedAt: new Date(),
        }));
        rows.push(...created);
        return { count: created.length };
      },
      findMany: async ({ where }: any) =>
        rows
          .filter((r) => r.tenantId === where.tenantId)
          .sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime()),
      findUnique: async ({ where }: any) =>
        rows.find((r) => r.id === where.id) ?? null,
      update: async ({ where, data }: any) => {
        const row = rows.find((r) => r.id === where.id);
        if (!row) throw new Error(`No posture drift finding ${where.id}`);
        return Object.assign(row, data, { updatedAt: new Date() });
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
}

describe('PostureDriftModule Suite', () => {
  let service: PostureDriftDetectorService;
  let controller: PostureDriftController;
  let streamService: LiveTelemetryStreamService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PostureDriftController],
      providers: [
        PostureDriftDetectorService,
        LiveTelemetryStreamService,
        { provide: PrismaService, useValue: createFakePostureDriftPrisma() },
      ],
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

      const updatedFindings = await service.getTenantFindings('tenant-remediate-test');
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

      const res = await controller.getFindings('tenant-findings-test');
      expect(res.tenantId).toBe('tenant-findings-test');
      expect(res.totalFindings).toBeGreaterThan(0);
    });
  });
});
