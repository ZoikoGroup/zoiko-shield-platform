/**
 * Differential Privacy Defense for AI Telemetry & Copilot Simulator
 * 
 * Simulates:
 * 1. Perturbing sensitive multi-tenant statistical telemetry using calibrated Laplace mechanism.
 * 2. Real-time epsilon privacy budget tracking and decrementing.
 * 3. Enforcing privacy budget exhaustion rejection to protect against membership inference.
 */

import 'dotenv/config';
import 'reflect-metadata';
import * as crypto from 'crypto';
import { DifferentialPrivacyGuardService } from '../apps/shield-ai/src/privacy/differential-privacy-guard.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield Differential Privacy Defense Guard Simulator');
  console.log('    Specification: ZS-AI-SEC-001 §6 (Membership Inference Protection)');
  console.log('========================================================================\n');

  const dpGuard = new DifferentialPrivacyGuardService();
  const tenantId = `tenant-${crypto.randomUUID().slice(0, 8)}`;

  console.log(`[1/3] Executing Privacy-Preserving Security Telemetry Aggregation...`);
  console.log(`  ➔ Initial Tenant Epsilon Budget: ${dpGuard.getRemainingBudget(tenantId).toFixed(2)} ε`);

  const query1 = dpGuard.perturbMetric({
    tenantId,
    metricName: 'privileged_account_anomalies_count',
    trueValue: 18,
    sensitivity: 1.0,
    epsilonCost: 0.5,
  });

  console.log(`  ✔ Metric: ${query1.metricName}`);
  console.log(`  ✔ True Raw Value: ${query1.trueValue}`);
  console.log(`  ✔ Sanitized Perturbed Value (Laplace Noise): ${query1.perturbedValue}`);
  console.log(`  ✔ Calibrated Noise Added: ${query1.noiseAdded.toFixed(4)}`);
  console.log(`  ✔ Remaining Epsilon Budget: ${query1.remainingEpsilonBudget} ε`);
  console.log(`  🔒 Differential Privacy Proof: ${query1.privacyProofDigest.slice(0, 32)}...`);

  console.log('\n[2/3] Performing Repeated Model Aggregations and Tracking Budget Depletion...');
  for (let i = 2; i <= 5; i++) {
    const res = dpGuard.perturbMetric({
      tenantId,
      metricName: `soc_metric_stream_${i}`,
      trueValue: 100 * i,
      sensitivity: 1.0,
      epsilonCost: 2.0, // Consuming 2.0 epsilon per query
    });
    console.log(`  ✔ Query #${i} -> True: ${res.trueValue} | Perturbed: ${res.perturbedValue} | Epsilon Left: ${res.remainingEpsilonBudget} ε`);
  }

  console.log('\n[3/3] Simulating Privacy Budget Exhaustion Tripwire Protection...');
  console.log(`  ➔ Attempting query when remaining budget is below cost...`);
  try {
    dpGuard.perturbMetric({
      tenantId,
      metricName: 'exfiltrated_data_volume_bytes',
      trueValue: 5242880,
      sensitivity: 1000.0,
      epsilonCost: 2.0,
    });
  } catch (err: any) {
    console.log(`  🚨 [PROTECTION ACTIVE]: ${err.message}`);
  }

  console.log('\n========================================================================');
  console.log(' 🎉 DIFFERENTIAL PRIVACY DEFENSE SIMULATION COMPLETED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Differential Privacy simulation failed:', err);
  process.exit(1);
});
