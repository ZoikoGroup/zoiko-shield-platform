/**
 * Cedar Policy DSL Engine & Fine-Grained SOAR Authorization Simulator
 * 
 * Simulates:
 * 1. Default-deny evaluation for unauthorized actor actions.
 * 2. Permitted execution of R1/R2 actions based on context variables.
 * 3. Enforced multi-person quorum (R4) forbidding unauthorized termination.
 */

import 'dotenv/config';
import 'reflect-metadata';
import * as crypto from 'crypto';
import { CedarPolicyEvaluatorService } from '../apps/shield-action/src/policy/cedar-policy-evaluator.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield Cedar Policy Fine-Grained Authorization Simulator');
  console.log('    Specification: ZS-T0-BE-ARCH-001 (Cedar Policy Engine)');
  console.log('========================================================================\n');

  const evaluator = new CedarPolicyEvaluatorService();
  const tenantId = `tenant-${crypto.randomUUID().slice(0, 8)}`;

  console.log(`[1/3] Seeded ${evaluator.getPolicies().length} Active Cedar Policies:`);
  for (const p of evaluator.getPolicies()) {
    console.log(`  - [${p.effect.toUpperCase()}] ${p.policyId}: ${p.description}`);
  }

  console.log('\n[2/3] Evaluating Remediation Decision Requests...');

  // Case 1: Unprivileged actor attempting action (Expect DENY)
  const req1 = {
    principal: 'Role::"JuniorSupport"',
    action: 'Action::"ISOLATE_ENDPOINT"',
    resource: 'Host::"PROD-K8S-01"',
    context: { tenantId, threatSeverity: 'HIGH' },
  };
  const res1 = evaluator.evaluate(req1 as any);
  console.log(`  ➔ Case 1: JuniorSupport executing ISOLATE_ENDPOINT`);
  console.log(`    Decision: ${res1.decision} | Reason: ${res1.reason}`);

  // Case 2: SecOps Analyst isolating infected host on CRITICAL threat (Expect ALLOW)
  const req2 = {
    principal: 'Role::"SecOpsAnalyst"',
    action: 'Action::"ISOLATE_ENDPOINT"',
    resource: 'Host::"PROD-K8S-01"',
    context: { tenantId, threatSeverity: 'CRITICAL', authorityLevel: 'R1' },
  };
  const res2 = evaluator.evaluate(req2 as any);
  console.log(`\n  ➔ Case 2: SecOpsAnalyst executing ISOLATE_ENDPOINT (Critical Threat)`);
  console.log(`    Decision: ${res2.decision} | Matched: [${res2.matchedPolicies.join(', ')}] | Digest: ${res2.evaluationDigest.slice(0, 16)}...`);

  // Case 3: Single person attempting R4 Cloud Termination (Expect DENY due to forbid unless dual-key)
  const req3 = {
    principal: 'Role::"SecOpsAnalyst"',
    action: 'Action::"TERMINATE_CLOUD_INSTANCE"',
    resource: 'Cloud::"i-091823746"',
    context: { tenantId, approverCount: 1, authorityLevel: 'R4' },
  };
  const res3 = evaluator.evaluate(req3 as any);
  console.log(`\n  ➔ Case 3: Single-Key R4 Cloud Termination Attempt (approverCount = 1)`);
  console.log(`    Decision: ${res3.decision} | Reason: ${res3.reason}`);

  // Case 4: Dual-key authorized R4 Cloud Termination (Expect ALLOW)
  evaluator.registerPolicy({
    policyId: 'cedar-pol-005',
    effect: 'permit',
    principal: 'Role::"SecOpsLead"',
    action: 'Action::"TERMINATE_CLOUD_INSTANCE"',
    resource: '*',
    conditions: {
      when: { 'context.approverCount': { gte: 2 } },
    },
    description: 'Permit cloud termination when dual-key quorum is verified',
  });

  const req4 = {
    principal: 'Role::"SecOpsLead"',
    action: 'Action::"TERMINATE_CLOUD_INSTANCE"',
    resource: 'Cloud::"i-091823746"',
    context: { tenantId, approverCount: 2, authorityLevel: 'R4' },
  };
  const res4 = evaluator.evaluate(req4 as any);
  console.log(`\n  ➔ Case 4: Dual-Key R4 Cloud Termination (approverCount = 2)`);
  console.log(`    Decision: ${res4.decision} | Matched: [${res4.matchedPolicies.join(', ')}]`);

  console.log('\n========================================================================');
  console.log(' 🎉 CEDAR POLICY AUTHORIZATION SIMULATION COMPLETED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Cedar simulation failed:', err);
  process.exit(1);
});
