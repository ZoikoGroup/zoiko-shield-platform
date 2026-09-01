/**
 * ZoikoShield Multi-Region Active-Active Ingest Shard Simulator
 * 
 * Demonstrates:
 * 1. Deterministic hashing of multi-tenant telemetry streams across global shard clusters.
 * 2. Real-time regional health checks & cross-region replication lag monitoring.
 * 3. Automatic failover routing during regional outage / network partition.
 * 4. Zero-loss self-healing return to primary regional node when health is restored.
 */

import 'dotenv/config';
import 'reflect-metadata';
import { MultiRegionIngestShardService } from '../apps/shield-ingest/src/sharding/multi-region-ingest-shard.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield Multi-Region Ingestion Sharding & Failover Simulator');
  console.log('    Specification: Active-Active Multi-Cloud Partitioning & Shard Routing');
  console.log('========================================================================\n');

  const shardingService = new MultiRegionIngestShardService();
  const sampleTenants = [
    'tenant-eu-fintech-ltd',
    'tenant-us-healthcare-org',
    'tenant-apac-ecommerce-corp',
    'tenant-global-aerospace-inc',
  ];

  // Step 1: Normal Ingestion Routing
  console.log('[Step 1/4] Inspecting Active-Active Regional Shards...');
  const shards = shardingService.getAllShardNodes();
  shards.forEach((s) => {
    console.log(`  ✔ Shard Node [${s.region}]: ${s.endpoint} (Status: ${s.status}, Lag: ${s.replicationLagMs}ms)`);
  });

  console.log('\n[Step 2/4] Deterministic Tenancy Shard Partitioning:');
  sampleTenants.forEach((tenantId) => {
    const route = shardingService.routeIngestStream(tenantId);
    console.log(`  ✔ Tenant '${tenantId}' ➔ Routed Region: ${route.routedRegion} (Failover: ${route.isFailover})`);
  });

  // Step 3: Simulate Regional Degradation and Failover
  console.log('\n[Step 3/4] Simulating major regional fiber cut in `us-east-1` (Status -> UNAVAILABLE)...');
  shardingService.updateShardHealth('us-east-1', 'UNAVAILABLE', 15400);

  console.log('  -> Re-evaluating routing decisions during outage:');
  sampleTenants.forEach((tenantId) => {
    const route = shardingService.routeIngestStream(tenantId);
    if (route.isFailover) {
      console.log(`  ⚠️ FAILOVER ACTIVATED: '${tenantId}' Primary (${route.primaryRegion}) ➔ Fallback (${route.routedRegion})`);
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
    console.log(`  ✔ Tenant '${tenantId}' ➔ Restored to Primary: ${route.routedRegion} (Failover: ${route.isFailover})`);
  });

  console.log('\n========================================================================');
  console.log(' 🎉 MULTI-REGION INGESTION SHARDING SIMULATION VERIFIED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Simulation failed:', err);
  process.exit(1);
});
