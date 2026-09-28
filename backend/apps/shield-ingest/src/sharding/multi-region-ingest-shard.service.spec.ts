import { MultiRegionIngestShardService } from './multi-region-ingest-shard.service';

describe('MultiRegionIngestShardService (Active-Active Multi-Cloud Telemetry Sharding)', () => {
  let service: MultiRegionIngestShardService;

  beforeEach(() => {
    service = new MultiRegionIngestShardService();
  });

  it('1. should deterministically hash tenants to primary regional shards', () => {
    const tenant1 = 'tenant-acme-bank';
    const tenant2 = 'tenant-globex-corp';

    const region1a = service.getPrimaryRegionForTenant(tenant1);
    const region1b = service.getPrimaryRegionForTenant(tenant1);
    expect(region1a).toBe(region1b); // Deterministic

    const route1 = service.routeIngestStream(tenant1);
    expect(route1.isFailover).toBe(false);
    expect(route1.routedRegion).toBe(region1a);
    expect(route1.endpoint).toBeDefined();
    expect(route1.partitionHash).toBeDefined();

    const route2 = service.routeIngestStream(tenant2);
    expect(route2.isFailover).toBe(false);
  });

  it('2. should fail closed (never auto-reroute cross-region) when the home cell is UNAVAILABLE — ADR-16', () => {
    const tenant = 'tenant-acme-bank';
    const primary = service.getPrimaryRegionForTenant(tenant);

    // Mark home cell as UNAVAILABLE with high replication lag
    service.updateShardHealth(primary, 'UNAVAILABLE', 12000);

    const decision = service.routeIngestStream(tenant);
    expect(decision.routingOutcome).toBe(
      'REFUSED_AUTOMATIC_FAILOVER_NOT_APPROVED',
    );
    expect(decision.isFailover).toBe(false);
    expect(decision.primaryRegion).toBe(primary);
    expect(decision.routedRegion).toBeUndefined();
    expect(decision.failoverReason).toContain('UNAVAILABLE');
  });

  it('3. should recover to home cell once regional health is restored', () => {
    const tenant = 'tenant-acme-bank';
    const primary = service.getPrimaryRegionForTenant(tenant);

    service.updateShardHealth(primary, 'UNAVAILABLE', 5000);
    expect(service.routeIngestStream(tenant).routingOutcome).toBe(
      'REFUSED_AUTOMATIC_FAILOVER_NOT_APPROVED',
    );

    // Restore health
    service.updateShardHealth(primary, 'HEALTHY', 10);
    const restoredRoute = service.routeIngestStream(tenant);
    expect(restoredRoute.routingOutcome).toBe('ROUTED');
    expect(restoredRoute.isFailover).toBe(false);
    expect(restoredRoute.routedRegion).toBe(primary);
  });
});
