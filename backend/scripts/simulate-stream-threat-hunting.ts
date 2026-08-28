/**
 * In-Flight Zero-Copy Real-Time Threat Hunting Engine Simulator
 * 
 * Simulates:
 * 1. High-throughput ingestion of live security events into in-memory ring buffers.
 * 2. Real-time SOC analyst query execution with sub-millisecond filter predicates.
 * 3. Instant match identification and dispatching before database write latency.
 */

import 'dotenv/config';
import 'reflect-metadata';
import * as crypto from 'crypto';
import { StreamThreatHuntingService } from '../apps/shield-ingest/src/threat-hunting/stream-threat-hunting.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield In-Flight Zero-Copy Real-Time Threat Hunting Simulator');
  console.log('    Specification: ZS-SOC-FEED-001 §9 (Sub-Millisecond Stream Querying)');
  console.log('========================================================================\n');

  const huntingService = new StreamThreatHuntingService();
  const tenantId = `tenant-${crypto.randomUUID().slice(0, 8)}`;

  console.log('[1/3] Streaming 1,000 High-Velocity Events into Zero-Copy Ring Buffer...');
  for (let i = 1; i <= 1000; i++) {
    const isSuspicious = i === 420;
    huntingService.ingestToStreamBuffer({
      eventId: `evt-stream-${i}`,
      tenantId,
      classUid: isSuspicious ? 4001 : 1001,
      severityId: isSuspicious ? 5 : 1, // 5 = High, 1 = Low
      actor: {
        userName: isSuspicious ? 'service-admin-compromised' : `user-worker-${i % 20}`,
        processName: isSuspicious ? 'c:\\windows\\system32\\cmd.exe /c vssadmin delete shadows' : 'node.exe',
        sourceIp: isSuspicious ? '198.51.100.88' : `10.0.1.${i % 250}`,
      },
      rawPayload: { batch: i },
      timestampEpochMs: Date.now(),
    });
  }

  console.log(`  ✔ Successfully buffered ${huntingService.getBufferCount()} in-flight events in memory.`);

  console.log('\n[2/3] Executing Sub-Millisecond Threat Hunting Query across In-Flight Stream...');
  console.log('  ➔ Hunt Predicate: [processName contains "vssadmin" AND minSeverity >= HIGH]');

  const matches = huntingService.executeQuery({
    queryId: 'hunt-ransomware-vssadmin',
    queryName: 'Shadow Copy Deletion Attempt (Ransomware In-Flight Behavior)',
    minSeverityId: 4,
    processNamePattern: 'vssadmin',
  });

  console.log(`\n[3/3] Live Stream Matches Dispatched (Total Matches: ${matches.length}):`);
  for (const m of matches) {
    console.log(`  🚨 MATCH ID: ${m.matchId}`);
    console.log(`  ✔ Query: "${m.queryName}"`);
    console.log(`  ✔ Processing Latency: ${m.processingLatencyMs.toFixed(2)} ms (Zero-Copy In-Flight Execution)`);
    console.log(`  ✔ Matching Event ID: ${m.matchingEvent.eventId}`);
    console.log(`  ✔ Attacker Process: ${m.matchingEvent.actor.processName}`);
    console.log(`  ✔ Compromised Identity: ${m.matchingEvent.actor.userName}`);
    console.log(`  ✔ Source IP: ${m.matchingEvent.actor.sourceIp}`);
    console.log(`  🔒 Query Attestation Digest: ${m.queryDigest}`);
  }

  console.log('\n========================================================================');
  console.log(' 🎉 IN-FLIGHT THREAT HUNTING SIMULATION COMPLETED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Stream Threat Hunting simulation failed:', err);
  process.exit(1);
});
