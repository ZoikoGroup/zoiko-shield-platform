import { Test, TestingModule } from '@nestjs/testing';
import { KmsHealthRebalancerService } from './kms-health-rebalancer.service';

describe('KmsHealthRebalancerService', () => {
  let service: KmsHealthRebalancerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KmsHealthRebalancerService],
    }).compile();

    service = module.get<KmsHealthRebalancerService>(
      KmsHealthRebalancerService,
    );
  });

  it('should report healthy baseline for default primary provider (AWS_KMS)', () => {
    expect(service.getPrimaryProvider()).toBe('AWS_KMS');
    const health = service.getProviderHealth('AWS_KMS');
    expect(health?.status).toBe('HEALTHY');
  });

  it('should automatically failover to secondary provider when primary suffers consecutive probe failures', () => {
    expect(service.getPrimaryProvider()).toBe('AWS_KMS');

    // Simulate 3 consecutive AWS KMS heartbeat failures
    service.recordProbe('AWS_KMS', false, 1500);
    service.recordProbe('AWS_KMS', false, 2000);
    service.recordProbe('AWS_KMS', false, 2200);

    const awsHealth = service.getProviderHealth('AWS_KMS');
    expect(awsHealth?.status).toBe('OUTAGE');
    expect(awsHealth?.consecutiveFailures).toBe(3);

    // Primary should automatically rebalance to GCP_CLOUD_KMS
    expect(service.getPrimaryProvider()).toBe('GCP_CLOUD_KMS');
  });

  it('should adjust routing weights appropriately', () => {
    const weights = service.getRoutingWeights();
    expect(weights.AWS_KMS).toBe(100);
    expect(weights.GCP_CLOUD_KMS).toBe(0);
  });
});
