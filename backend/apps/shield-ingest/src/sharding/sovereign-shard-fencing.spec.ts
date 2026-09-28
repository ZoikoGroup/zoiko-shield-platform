import { Test, TestingModule } from '@nestjs/testing';
import { MultiRegionIngestShardService } from './multi-region-ingest-shard.service';

describe('MultiRegionIngestShardService (LAB 16 Multi-Region & Sovereign Ingest Sharding)', () => {
  let shardService: MultiRegionIngestShardService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MultiRegionIngestShardService],
    }).compile();

    shardService = module.get<MultiRegionIngestShardService>(
      MultiRegionIngestShardService,
    );
  });

  it('should deterministically assign primary regional shard based on tenant ID', () => {
    const tenant1 = 'tenant-acme-prod-us';
    const tenant2 = 'tenant-global-bank-eu';

    const region1 = shardService.getPrimaryRegionForTenant(tenant1);
    const region2 = shardService.getPrimaryRegionForTenant(tenant2);

    expect(['eu-west-1', 'us-east-1', 'ap-southeast-1']).toContain(region1);
    expect(['eu-west-1', 'us-east-1', 'ap-southeast-1']).toContain(region2);

    // Consistency check: Repeated calls must return the identical region
    expect(shardService.getPrimaryRegionForTenant(tenant1)).toBe(region1);
    expect(shardService.getPrimaryRegionForTenant(tenant2)).toBe(region2);
  });

  it('should route ingestion stream to healthy home cell shard without failover flag', () => {
    const tenantId = 'tenant-healthy-shard-01';
    const decision = shardService.routeIngestStream(tenantId);

    expect(decision.tenantId).toBe(tenantId);
    expect(decision.routingOutcome).toBe('ROUTED');
    expect(decision.isFailover).toBe(false);
    expect(decision.routedRegion).toBe(decision.primaryRegion);
    expect(decision.endpoint).toBeDefined();
    expect(decision.partitionHash).toBeDefined();
  });

  it('ADR-16: must fail closed, never reroute across regions, when the home cell is unavailable (regression test for prior EU -> US cross-sovereignty failover bug)', () => {
    const tenantId = 'tenant-test-failover';
    const primaryRegion = shardService.getPrimaryRegionForTenant(tenantId);

    // Mark home cell as UNAVAILABLE
    shardService.updateShardHealth(primaryRegion, 'UNAVAILABLE', 4500);

    const decision = shardService.routeIngestStream(tenantId);

    expect(decision.routingOutcome).toBe(
      'REFUSED_AUTOMATIC_FAILOVER_NOT_APPROVED',
    );
    expect(decision.isFailover).toBe(false);
    expect(decision.primaryRegion).toBe(primaryRegion);
    expect(decision.routedRegion).toBeUndefined();
    expect(decision.endpoint).toBeUndefined();
    expect(decision.failoverReason).toContain('UNAVAILABLE');
    expect(decision.failoverReason).toContain('ADR-16');

    // The specific bug this guards against: a EU home cell must never be
    // silently routed to a US (or any other) region on failure.
    if (primaryRegion === 'eu-west-1') {
      expect(decision.routedRegion).not.toBe('us-east-1');
    }
  });

  it('should restore home cell routing once the regional shard recovers to HEALTHY', () => {
    const tenantId = 'tenant-test-recovery';
    const primaryRegion = shardService.getPrimaryRegionForTenant(tenantId);

    // Degrade then restore
    shardService.updateShardHealth(primaryRegion, 'DEGRADED', 850);
    shardService.updateShardHealth(primaryRegion, 'HEALTHY', 14);

    const decision = shardService.routeIngestStream(tenantId);

    expect(decision.routingOutcome).toBe('ROUTED');
    expect(decision.isFailover).toBe(false);
    expect(decision.routedRegion).toBe(primaryRegion);
  });
});
