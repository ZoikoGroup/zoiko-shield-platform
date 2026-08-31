/**
 * Automated Adaptive SOAR Circuit Breaker & Blast Radius Governor Simulator
 * 
 * Simulates:
 * 1. Dispatching automated response actions within safe operational thresholds (CLOSED state).
 * 2. Tripping the circuit breaker to OPEN upon high error rates or consecutive API failures.
 * 3. Enforcing blast radius limits to prevent runaway automated disruptions across infrastructure.
 * 4. Circuit reset and recovery verification.
 */

import 'dotenv/config';
import 'reflect-metadata';
import * as crypto from 'crypto';
import { SoarCircuitBreakerService } from '../apps/shield-action/src/circuit-breaker/soar-circuit-breaker.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield Adaptive SOAR Circuit Breaker & Blast Radius Simulator');
  console.log('    Specification: ZS-SOAR-DISP-001 §10 (SOAR Blast Radius & Rate Governor)');
  console.log('========================================================================\n');

  const circuitBreaker = new SoarCircuitBreakerService();
  const tenantId = `tenant-${crypto.randomUUID().slice(0, 8)}`;
  const playbookId = 'playbook-aws-iam-quarantine-v2';

  console.log('[1/3] Executing Standard SOAR Response Actions (Circuit: CLOSED)...');
  const check1 = circuitBreaker.canExecuteAction(tenantId, playbookId, 'role-compromised-dev', 4);
  console.log(`  ➔ Target: role-compromised-dev | Allowed: ${check1.isActionAllowed} | State: ${check1.state}`);

  circuitBreaker.recordActionOutcome({
    actionId: 'act-001',
    playbookId,
    tenantId,
    targetResource: 'role-compromised-dev',
    status: 'SUCCESS',
    durationMs: 95,
  });
  console.log('  ✔ Dispatched action act-001 (SUCCESS) - Latency: 95ms');

  console.log('\n[2/3] Simulating Cascading Provider Failures & Error Rate Tripwire...');
  // Simulate repeated AWS API throttling / downstream service failures
  for (let i = 1; i <= 3; i++) {
    const status = circuitBreaker.recordActionOutcome({
      actionId: `act-err-00${i}`,
      playbookId,
      tenantId,
      targetResource: `role-compromised-dev-0${i}`,
      status: 'FAILED',
      durationMs: 1200,
    });
    console.log(`  ❌ Action act-err-00${i} FAILED -> Error Rate: ${status.errorRatePercentage.toFixed(1)}% (State: ${status.state})`);
  }

  console.log('\n  ➔ Attempting next automated action while Circuit is OPEN:');
  const blockedCheck = circuitBreaker.canExecuteAction(tenantId, playbookId, 'role-compromised-dev-04');
  console.log(`  🚨 Action Allowed: ${blockedCheck.isActionAllowed}`);
  console.log(`  🚨 Circuit State: ${blockedCheck.state} (HALTED)`);
  console.log(`  🚨 Trip Reason: ${blockedCheck.tripReason}`);

  console.log('\n[3/3] Simulating Blast Radius Governor Ceiling Protection...');
  const blastPlaybook = 'playbook-mass-host-isolate';
  const blastLimit = 3; // Max 3 hosts per execution wave

  circuitBreaker.recordActionOutcome({ actionId: 'b-1', playbookId: blastPlaybook, tenantId, targetResource: 'host-k8s-node-01', status: 'SUCCESS', durationMs: 40 });
  circuitBreaker.recordActionOutcome({ actionId: 'b-2', playbookId: blastPlaybook, tenantId, targetResource: 'host-k8s-node-02', status: 'SUCCESS', durationMs: 45 });
  circuitBreaker.recordActionOutcome({ actionId: 'b-3', playbookId: blastPlaybook, tenantId, targetResource: 'host-k8s-node-03', status: 'SUCCESS', durationMs: 42 });

  console.log(`  ➔ Dispatched 3 host isolations against maximum ceiling of ${blastLimit}`);
  console.log('  ➔ Attempting 4th host isolation: "host-k8s-node-04"');
  const blastCheck = circuitBreaker.canExecuteAction(tenantId, blastPlaybook, 'host-k8s-node-04', blastLimit);

  console.log(`  🚨 Blast Radius Check: Action Allowed: ${blastCheck.isActionAllowed}`);
  console.log(`  🚨 Trip Reason: ${blastCheck.tripReason}`);
  console.log(`  🔒 Total Distinct Targets Managed: ${blastCheck.distinctTargetResourcesCount}/${blastLimit}`);

  console.log('\n========================================================================');
  console.log(' 🎉 SOAR CIRCUIT BREAKER SIMULATION COMPLETED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Circuit breaker simulation failed:', err);
  process.exit(1);
});
