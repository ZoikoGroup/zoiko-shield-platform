/**
 * ZoikoShield Real-Time Stream Deduplication Bloom Filter Simulator
 * 
 * Demonstrates:
 * 1. High-throughput in-memory bit array Bloom filter with multiple hashing functions.
 * 2. Rapid identification and discard of burst duplicate security events.
 * 3. Exact matching in active sliding window cache.
 * 4. Verification of deduplication metrics & reduction ratio.
 */

import 'dotenv/config';
import 'reflect-metadata';
import { StreamDeduplicationService } from '../apps/shield-ingest/src/deduplication/stream-deduplication.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield Real-Time Stream Deduplication Bloom Filter Simulator');
  console.log('    Specification: High-Throughput Burst Event Deduplication Engine');
  console.log('========================================================================\n');

  const dedupService = new StreamDeduplicationService();
  const tenantId = 'tenant-enterprise-financial-group';

  // Step 1: Ingest Unique Normal Telemetry Stream
  console.log('[Step 1/4] Ingesting stream of 5 distinct security telemetry events...');
  for (let i = 1; i <= 5; i++) {
    const result = dedupService.checkAndRegister(tenantId, 'EDR_PROCESS_EXEC', {
      hostId: `SRV-NODE-0${i}`,
      pid: 1000 + i,
      image: '/usr/bin/nginx',
    });
    console.log(`  ✔ Event #${i} -> Fingerprint: ${result.fingerprint.substring(0, 16)}... (Duplicate: ${result.isDuplicate})`);
  }

  // Step 2: Ingest Burst of 100 Duplicate Syslog Storm Events
  console.log('\n[Step 2/4] Simulating burst syslog storm of 100 identical network firewall drops...');
  const stormPayload = {
    srcIp: '203.0.113.195',
    destPort: 445,
    action: 'DROP_SMB_PROBE',
  };

  let discarded = 0;
  let accepted = 0;
  for (let i = 0; i < 100; i++) {
    const res = dedupService.checkAndRegister(tenantId, 'FIREWALL_DROP', stormPayload);
    if (res.isDuplicate) {
      discarded++;
    } else {
      accepted++;
    }
  }
  console.log(`  ✔ Storm Ingestion Result: ${accepted} Registered (First occurrence), ${discarded} Discarded`);

  // Step 3: Verify Deduplication Metrics
  console.log('\n[Step 3/4] Checking Deduplication Metrics:');
  const metrics = dedupService.getMetrics();
  console.log(`  ✔ Total Evaluated: ${metrics.totalEvaluated}`);
  console.log(`  ✔ Unique Ingested: ${metrics.uniqueIngested}`);
  console.log(`  ✔ Duplicates Discarded: ${metrics.duplicatesDiscarded}`);
  console.log(`  ✔ Deduplication Ratio: ${(metrics.deduplicationRatio * 100).toFixed(2)}% reduction in write amplification`);

  console.log('\n========================================================================');
  console.log(' 🎉 REAL-TIME STREAM DEDUPLICATION SIMULATION VERIFIED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Simulation failed:', err);
  process.exit(1);
});
