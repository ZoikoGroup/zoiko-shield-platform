/**
 * Billing Tier Governance & Real-Time Meter Exhaustion Guard Simulator
 * 
 * Simulates:
 * 1. Multi-tier quota tracking (Starter, Professional, Enterprise, Government).
 * 2. Real-time transition through 75% warning, 90% critical alert, 100% grace period, and hard throttle blocks.
 * 3. Generation of cryptographic audit digests for billing disputes.
 */

import 'dotenv/config';
import 'reflect-metadata';
import * as crypto from 'crypto';
import { MeterExhaustionGuardService } from '../apps/shield-core/src/modules/metering/meter-exhaustion-guard.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield Billing Tier Governance & Quota Guard Simulator');
  console.log('    Specification: ZS-T0-BE-ARCH-001 §14 (Meter Exhaustion Engine)');
  console.log('========================================================================\n');

  const meterGuard = new MeterExhaustionGuardService();
  const tenantId = `tenant-${crypto.randomUUID().slice(0, 8)}`;

  console.log('[1/4] Evaluating Normal Tier Consumption (Starter Plan: 100 GB Limit)...');
  const d1 = meterGuard.evaluateMeterExhaustion({
    tenantId,
    planTier: 'STARTER',
    currentIngestGb: 45, // 45%
    activeEndpoints: 20,
  });
  console.log(`  ✔ Status: ${d1.status} (${d1.capacityPercentage}%) | Ingest Allowed: ${d1.isIngestPermitted}`);
  console.log(`  ✔ Enforcement Action: ${d1.throttleAction} | Reason: ${d1.reason}`);

  console.log('\n[2/4] Evaluating 75% Warning Threshold (Professional Plan: 1000 GB Limit)...');
  const d2 = meterGuard.evaluateMeterExhaustion({
    tenantId,
    planTier: 'PROFESSIONAL',
    currentIngestGb: 780, // 78%
    activeEndpoints: 350,
  });
  console.log(`  ✔ Status: ${d2.status} (${d2.capacityPercentage}%) | Ingest Allowed: ${d2.isIngestPermitted}`);
  console.log(`  ✔ Enforcement Action: ${d2.throttleAction} | Reason: ${d2.reason}`);

  console.log('\n[3/4] Evaluating 90% Critical Threshold Escalation (Professional Plan)...');
  const d3 = meterGuard.evaluateMeterExhaustion({
    tenantId,
    planTier: 'PROFESSIONAL',
    currentIngestGb: 940, // 94%
    activeEndpoints: 480,
  });
  console.log(`  ✔ Status: ${d3.status} (${d3.capacityPercentage}%) | Ingest Allowed: ${d3.isIngestPermitted}`);
  console.log(`  ✔ Enforcement Action: ${d3.throttleAction} | Reason: ${d3.reason}`);

  console.log('\n[4/4] Evaluating Quota Exhaustion & 48-Hour Overrun Grace Period...');
  const d4Grace = meterGuard.evaluateMeterExhaustion({
    tenantId,
    planTier: 'PROFESSIONAL',
    currentIngestGb: 1080, // 108%
    activeEndpoints: 520,
    exhaustionOverrunHours: 16, // within 48h grace
  });
  console.log(`  ➔ State A (Active Grace Period - 16h elapsed):`);
  console.log(`    Status: ${d4Grace.status} (${d4Grace.capacityPercentage}%) | Ingest Allowed: ${d4Grace.isIngestPermitted}`);
  console.log(`    Action: ${d4Grace.throttleAction} | Detail: ${d4Grace.reason}`);

  const d4Blocked = meterGuard.evaluateMeterExhaustion({
    tenantId,
    planTier: 'PROFESSIONAL',
    currentIngestGb: 1150, // 115%
    activeEndpoints: 520,
    exhaustionOverrunHours: 52, // grace expired (> 48h)
  });
  console.log(`\n  ➔ State B (Grace Period Expired - 52h elapsed):`);
  console.log(`    Status: ${d4Blocked.status} (${d4Blocked.capacityPercentage}%) | Ingest Allowed: ${d4Blocked.isIngestPermitted}`);
  console.log(`    Action: ${d4Blocked.throttleAction} | Detail: ${d4Blocked.reason}`);
  console.log(`    🔒 Cryptographic Dispute Digest: ${d4Blocked.auditDigest}`);

  console.log('\n========================================================================');
  console.log(' 🎉 BILLING TIER GOVERNANCE SIMULATION COMPLETED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Meter governance simulation failed:', err);
  process.exit(1);
});
