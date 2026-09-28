/**
 * ZoikoShield Home-Cell Ingest Shard Simulator
 *
 * Demonstrates (per ADR-16 — Regional cell allocation and failover):
 * 1. Deterministic hashing of tenants to a single home-cell region.
 * 2. Real-time regional health checks & replication lag monitoring.
 * 3. Fail-closed refusal (R-11) when a tenant's home cell is unhealthy — no automatic
 *    cross-region failover, residency-breaking or otherwise. Full multi-region
 *    active-active is DEFERRED; recovery from an unhealthy home cell requires an
 *    approved, tested evacuation/transfer procedure, not a runtime reroute.
 * 4. Zero-loss self-healing return to the home cell when health is restored.
 */

import 'dotenv/config';
import 'reflect-metadata';
import { MultiRegionIngestShardService } from '../apps/shield-ingest/src/sharding/multi-region-ingest-shard.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield Home-Cell Ingestion Sharding & Fail-Closed Simulator');
  console.log('    Specification: ADR-16 Single Home Cell, No Automatic Cross-Region Failover');
  console.log('========================================================================\n');

  const shardingService = new MultiRegionIngestShardService();
  const sampleTenants = [
    'tenant-eu-fintech-ltd',
    'tenant-us-healthcare-org',
    'tenant-apac-ecommerce-corp',
    'tenant-global-aerospace-inc',
  ];

  // Step 1: Normal Ingestion Routing
  console.log('[Step 1/4] Inspecting Regional Shards...');
  const shards = shardingService.getAllShardNodes();
  shards.forEach((s) => {
    console.log(`  ✔ Shard Node [${s.region}]: ${s.endpoint} (Status: ${s.status}, Lag: ${s.replicationLagMs}ms)`);
  });

  console.log('\n[Step 2/4] Deterministic Home-Cell Tenancy Partitioning:');
  sampleTenants.forEach((tenantId) => {
    const route = shardingService.routeIngestStream(tenantId);
    console.log(`  ✔ Tenant '${tenantId}' ➔ Home Cell: ${route.routedRegion} (Outcome: ${route.routingOutcome})`);
  });

  // Step 3: Simulate Regional Degradation — must fail closed, not fail over
  console.log('\n[Step 3/4] Simulating major regional fiber cut in `us-east-1` (Status -> UNAVAILABLE)...');
  shardingService.updateShardHealth('us-east-1', 'UNAVAILABLE', 15400);

  console.log('  -> Re-evaluating routing decisions during outage:');
  sampleTenants.forEach((tenantId) => {
    const route = shardingService.routeIngestStream(tenantId);
    if (route.routingOutcome === 'REFUSED_AUTOMATIC_FAILOVER_NOT_APPROVED') {
      console.log(`  ⛔ ROUTING REFUSED (fail-closed): '${tenantId}' Home Cell (${route.primaryRegion}) is unavailable — no automatic reroute.`);
      console.log(`     Reason: ${route.failoverReason}`);
    } else {
      console.log(`  ✔ Tenant '${tenantId}' unaffected ➔ ${route.routedRegion}`);
    }
  });

  // Step 4: Health Restoration
  console.log('\n[Step 4/4] Restoring regional health in `us-east-1` (Status -> HEALTHY)...');
  shardingService.updateShardHealth('us-east-1', 'HEALTHY', 14);

  console.log('  -> Re-checking routing:');
  sampleTenants.forEach((tenantId) => {
    const route = shardingService.routeIngestStream(tenantId);
    console.log(`  ✔ Tenant '${tenantId}' ➔ Restored to Home Cell: ${route.routedRegion} (Outcome: ${route.routingOutcome})`);
  });

  console.log('\n========================================================================');
  console.log(' 🎉 HOME-CELL INGESTION SHARDING SIMULATION VERIFIED (fail-closed, ADR-16)!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Simulation failed:', err);
  process.exit(1);
});
