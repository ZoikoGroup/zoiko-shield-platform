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

  it('should report healthy baseline for default primary provider (GCP_CLOUD_KMS — the real hosting baseline)', () => {
    expect(service.getPrimaryProvider()).toBe('GCP_CLOUD_KMS');
    const health = service.getProviderHealth('GCP_CLOUD_KMS');
    expect(health?.status).toBe('HEALTHY');
  });

  it('should automatically failover to secondary provider when primary suffers consecutive probe failures', () => {
    expect(service.getPrimaryProvider()).toBe('GCP_CLOUD_KMS');

    // Simulate 3 consecutive GCP Cloud KMS heartbeat failures
    service.recordProbe('GCP_CLOUD_KMS', false, 1500);
    service.recordProbe('GCP_CLOUD_KMS', false, 2000);
    service.recordProbe('GCP_CLOUD_KMS', false, 2200);

    const gcpHealth = service.getProviderHealth('GCP_CLOUD_KMS');
    expect(gcpHealth?.status).toBe('OUTAGE');
    expect(gcpHealth?.consecutiveFailures).toBe(3);

    // Primary should automatically rebalance to the documented cross-cloud
    // escape hatch (AWS_KMS) — modeled, not a real wired-up client today.
    expect(service.getPrimaryProvider()).toBe('AWS_KMS');
  });

  it('should swap back to the recovering provider if the new primary also fails (2-provider ping-pong)', () => {
    service.recordProbe('GCP_CLOUD_KMS', false, 1500);
    service.recordProbe('GCP_CLOUD_KMS', false, 2000);
    service.recordProbe('GCP_CLOUD_KMS', false, 2200);
    expect(service.getPrimaryProvider()).toBe('AWS_KMS');

    service.recordProbe('AWS_KMS', false, 1500);
    service.recordProbe('AWS_KMS', false, 2000);
    service.recordProbe('AWS_KMS', false, 2200);
    expect(service.getPrimaryProvider()).toBe('GCP_CLOUD_KMS');
  });

  it('falls over to the one remaining provider when explicitly told the current secondary itself failed', () => {
    // triggerFailover can be called directly (not just via recordProbe's
    // auto-detection, which only ever fails the current primary) — this
    // exercises the case where the failed provider IS the secondary, which
    // must resolve to the third provider, not a hardcoded literal.
    expect(service.getPrimaryProvider()).toBe('GCP_CLOUD_KMS');
    const event = service.triggerFailover('AWS_KMS', 'manual drill');
    expect(event.newPrimaryProvider).toBe('AZURE_KEYVAULT');
  });

  it('should adjust routing weights appropriately', () => {
    const weights = service.getRoutingWeights();
    expect(weights.GCP_CLOUD_KMS).toBe(100);
    expect(weights.AWS_KMS).toBe(0);
    expect(weights.AZURE_KEYVAULT).toBe(0);
  });
});
