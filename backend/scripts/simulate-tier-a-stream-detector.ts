/**
 * Deterministic Tier-A Windowed Stream Detector Simulator
 * 
 * Simulates:
 * 1. Evaluating real-time security events against Tier-A Kafka Streams rule contract.
 * 2. Aggregating tumbling/sliding time window events partitioned by `tenant_id:entity_key`.
 * 3. Enforcing LAB 08 mandatory rule: missing/degraded data emits explicit `INCOMPLETE` state, never low risk.
 * 4. Generating signed AlertCandidate records.
 */

import 'dotenv/config';
import 'reflect-metadata';
import * as crypto from 'crypto';
import {
  TierAWindowedDetectorService,
  TierARuleContract,
} from '../apps/shield-ingest/src/detection/tier-a/tier-a-windowed-detector.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield Deterministic Tier-A Windowed Stream Detector Simulator');
  console.log('    Specification: Backend Build Guide §LAB 08 (Kafka Tier-A Detections)');
  console.log('========================================================================\n');

  const detectorService = new TierAWindowedDetectorService();
  const tenantId = `tenant-${crypto.randomUUID().slice(0, 8)}`;
  const compromisedUser = 'analyst.operator@enterprise-bank.com';

  const credentialStuffingRule: TierARuleContract = {
    ruleId: 'ZS-RULE-AUTH-CREDENTIAL-STUFFING-001',
    version: '2.1.0',
    requiredSchema: 'ocsf.authentication.v1',
    partitionKeyPattern: 'tenant_id:actor_id',
    windowSeconds: 300,
    graceSeconds: 30,
    missingDataBehavior: 'INCOMPLETE',
    replaySemantics: 'DETERMINISTIC_PINNED_SNAPSHOT',
    sloClass: 'TIER_A_SUB_SECOND',
    thresholdCount: 3,
    matchPredicate: (e) => e.payload.auth_result === 'DENIED_INVALID_CREDENTIALS',
  };

  console.log(`[1/3] Feeding Windowed Telemetry Events (Partition: ${tenantId}:${compromisedUser})...`);

  for (let i = 1; i <= 3; i++) {
    const candidate = detectorService.processStreamEvent(credentialStuffingRule, {
      eventId: `evt-auth-00${i}`,
      tenantId,
      entityKey: compromisedUser,
      schemaName: 'ocsf.authentication.v1',
      timestamp: new Date(Date.now() - (3 - i) * 10000).toISOString(),
      payload: { auth_result: 'DENIED_INVALID_CREDENTIALS', ip: '198.51.100.44' },
    });

    console.log(`  ➔ Event 00${i} -> Aggregated Count: ${candidate.aggregatedEventCount}/3 | State: ${candidate.detectionState}`);
    if (candidate.detectionState === 'MATCHED') {
      console.log(`\n  🚨 [TIER-A ALERT GENERATED] Candidate ID: ${candidate.candidateId}`);
      console.log(`  🚨 Severity: ${candidate.severity} | Partition: ${candidate.partitionKey}`);
      console.log(`  🔒 Attestation: ${candidate.attestationDigest}`);
    }
  }

  console.log('\n[2/3] Simulating Late Data Ingestion within Grace Period...');
  const lateCandidate = detectorService.processStreamEvent(credentialStuffingRule, {
    eventId: 'evt-auth-late-004',
    tenantId,
    entityKey: compromisedUser,
    schemaName: 'ocsf.authentication.v1',
    timestamp: new Date().toISOString(),
    payload: { auth_result: 'DENIED_INVALID_CREDENTIALS' },
  });
  console.log(`  ✔ Late event aggregated into active window (Count: ${lateCandidate.aggregatedEventCount})`);

  console.log('\n[3/3] Simulating Missing Context / Degraded Data Stream...');
  const incompleteCandidate = detectorService.processStreamEvent(
    credentialStuffingRule,
    {
      eventId: 'evt-degraded-001',
      tenantId,
      entityKey: 'unknown-entity',
      schemaName: 'ocsf.corrupted.v1',
      timestamp: new Date().toISOString(),
      payload: {},
    },
    true, // Stream degraded flag
  );

  console.log(`  ⚠️  Missing Data State: ${incompleteCandidate.detectionState}`);
  console.log(`  ⚠️  Severity Assigned: ${incompleteCandidate.severity} (Mandatory LAB 08 INCOMPLETE Compliance)`);
  console.log(`  🔒 Attestation Digest: ${incompleteCandidate.attestationDigest}`);

  console.log('\n========================================================================');
  console.log(' 🎉 TIER-A WINDOWED STREAM DETECTOR SIMULATION COMPLETED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Tier-A simulation failed:', err);
  process.exit(1);
});
