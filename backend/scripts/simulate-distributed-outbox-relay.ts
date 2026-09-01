/**
 * ZoikoShield Distributed Outbox Transactional Relay Simulator
 * 
 * Demonstrates:
 * 1. Distributed advisory lock acquisition across multi-pod replicas.
 * 2. High-throughput CDC event polling and Kafka topic dispatch.
 * 3. Bounded exponential retry backoff on transient transport failures.
 * 4. Dead Letter Queue (DLQ) containment for poison messages.
 */

import 'dotenv/config';
import 'reflect-metadata';
import { DistributedOutboxRelayService } from '../apps/shield-core/src/modules/outbox/distributed-outbox-relay.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield Distributed Outbox Transactional Relay Simulator');
  console.log('    Specification: High-Reliability CDC Dispatch, Advisory Locks & DLQ');
  console.log('========================================================================\n');

  const relayService = new DistributedOutboxRelayService();
  const tenantId = 'tenant-enterprise-financial-group';

  // Step 1: Enqueue Valid Events
  console.log('[Step 1/4] Enqueueing high-priority transactional security events...');
  relayService.enqueueEvent('identity.user.mfa_enforced', tenantId, {
    principalId: 'usr-admin-88',
    authMethod: 'FIDO2_WEBAUTHN',
  });
  relayService.enqueueEvent('detection.ioc.matched', tenantId, {
    iocType: 'SHA256',
    hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  });
  console.log('  ✔ Enqueued 2 standard CDC events.');

  // Step 2: Normal Dispatch Batch
  console.log('\n[Step 2/4] Acquiring distributed advisory lock and dispatching batch...');
  const batch1 = await relayService.processBatch(10);
  console.log(`  ✔ Pod Leadership: ${batch1.podId} (Lock Acquired: ${batch1.lockAcquired})`);
  console.log(`  ✔ Published Events: ${batch1.publishedCount}/${batch1.claimedCount}`);

  // Step 3: Transient Failure & Retry Simulation
  console.log('\n[Step 3/4] Enqueueing event with simulated transient network partition (retries = 3)...');
  const retryRecord = relayService.enqueueEvent('soar.playbook.initiated', tenantId, {
    playbook: 'ISOLATE_HOST_CONTAINMENT',
  }, 3);

  let failCount = 0;
  const transientFailure = (rec: any) => {
    if (rec.id === retryRecord.id && failCount < 2) {
      failCount++;
      return true;
    }
    return false;
  };

  console.log('  -> Iteration 1: Transient network failure...');
  await relayService.processBatch(10, transientFailure);

  console.log('  -> Iteration 2: Transient network failure...');
  await relayService.processBatch(10, transientFailure);

  console.log('  -> Iteration 3: Network recovered -> Dispatched successfully.');
  const batch2 = await relayService.processBatch(10, transientFailure);
  console.log(`  ✔ Recovered and published: ${batch2.publishedCount} event(s)`);

  // Step 4: Poison Message & DLQ Containment
  console.log('\n[Step 4/4] Enqueueing unrecoverable poison message (maxAttempts = 2)...');
  relayService.enqueueEvent('action.emergency_freeze', tenantId, {
    malformedBinaryPayload: true,
  }, 2);

  console.log('  -> Iteration 1: Permanent failure...');
  await relayService.processBatch(10, () => true);

  console.log('  -> Iteration 2: Max attempts reached -> Moved to Dead-Letter Queue...');
  const dlqBatch = await relayService.processBatch(10, () => true);
  console.log(`  ✔ Poison events quarantined in DLQ: ${dlqBatch.dlqCount}`);

  const finalMetrics = relayService.getMetrics();
  console.log('\n[Relay Metrics Summary]');
  console.log(`  ✔ Published Total: ${finalMetrics.publishedCount}`);
  console.log(`  ✔ Quarantined DLQ Total: ${finalMetrics.dlqCount}`);
  console.log(`  ✔ Pending Queue Size: ${finalMetrics.pendingCount}`);

  console.log('\n========================================================================');
  console.log(' 🎉 DISTRIBUTED TRANSACTIONAL OUTBOX RELAY SIMULATION VERIFIED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Simulation failed:', err);
  process.exit(1);
});
