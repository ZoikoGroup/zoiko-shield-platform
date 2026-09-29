import { Test, TestingModule } from '@nestjs/testing';
import { CryptoEscrowController } from './crypto-escrow.controller';
import { KmsHealthRebalancerService } from './kms-health-rebalancer.service';
import { SplitKmsEscrowService } from './split-kms-escrow.service';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';

describe('CryptoEscrowController', () => {
  let controller: CryptoEscrowController;
  let kmsHealthService: KmsHealthRebalancerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CryptoEscrowController],
      providers: [
        KmsHealthRebalancerService,
        {
          provide: SplitKmsEscrowService,
          useValue: {
            generateAndWrapSplitMasterKey: jest.fn(),
            unwrapSplitMasterKey: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CryptoEscrowController>(CryptoEscrowController);
    kmsHealthService = module.get<KmsHealthRebalancerService>(
      KmsHealthRebalancerService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return KMS health and routing weights', () => {
    const res = controller.getKmsHealth();
    expect(res.statusCode).toBe(200);
    expect(res.data.primaryProvider).toBe('GCP_CLOUD_KMS');
    expect(res.data.routingWeights.GCP_CLOUD_KMS).toBe(100);
    expect(res.data.providers.GCP_CLOUD_KMS).toBeDefined();
  });

  it('should record a KMS probe and update provider latency', () => {
    const res = controller.recordProbe({
      provider: 'GCP_CLOUD_KMS',
      latencyMs: 28,
      success: true,
    });
    expect(res.statusCode).toBe(200);
    expect(res.data.lastLatencyMs).toBe(28);
  });

  it('should trigger failover when requested', () => {
    const user = {
      id: 'user-secops-01',
      sub: 'user-secops-01',
      email: 'secops@zoiko.com',
      tenantId: '00000000-0000-0000-0000-000000000001',
      environmentId: 'env-prod-01',
      roles: ['SECOPS_ADMIN'],
      permissions: ['tenant:resource:write'],
      assuranceLevel: 'PASSKEY',
    } as any;

    const res = controller.triggerFailover(user, {
      failedProvider: 'GCP_CLOUD_KMS',
      reason: 'Scheduled cloud failover drill',
    });

    expect(res.statusCode).toBe(200);
    expect(res.data.failedProvider).toBe('GCP_CLOUD_KMS');
    expect(res.data.newPrimaryProvider).toBe('AWS_KMS');
    expect(kmsHealthService.getPrimaryProvider()).toBe('AWS_KMS');
  });
});
