/**
 * Temporal Durable Case Investigation Workflow Simulator
 * 
 * Simulates:
 * 1. Starting durable `InvestigateAlertWorkflow` instance with opaque evidence references (no raw customer payloads).
 * 2. Transitioning through state machine: INITIALIZED -> GATHERING_EVIDENCE -> EVALUATING_PLAYBOOK -> AWAITING_HUMAN_DECISION.
 * 3. Handling asynchronous `@SignalMethod recordHumanDecision` with approval, containment dispatch, and cryptographic audit attestation.
 */

import 'dotenv/config';
import 'reflect-metadata';
import * as crypto from 'crypto';
import {
  InvestigateAlertWorkflowService,
  InvestigationInput,
  HumanDecisionSignal,
} from '../apps/shield-core/src/modules/workflows/investigate-alert-workflow.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield Temporal Durable Case Investigation Workflow Simulator');
  console.log('    Specification: Backend Build Guide §LAB 10 (Temporal Case & Evidence)');
  console.log('========================================================================\n');

  const workflowService = new InvestigateAlertWorkflowService();
  const tenantId = `tenant-${crypto.randomUUID().slice(0, 8)}`;
  const workflowId = `wf-case-inv-${crypto.randomUUID().slice(0, 8)}`;

  console.log('[1/3] Initiating Durable Temporal Investigation Workflow...');
  const input: InvestigationInput = {
    workflowId,
    tenantId,
    alertCandidateId: `alert-cand-${crypto.randomUUID().slice(0, 6)}`,
    severity: 'CRITICAL',
    evidenceOpaquePointers: [
      'gcs://zs-evidence-eu-west1/snapshots/raw-telemetry-sha256-e91b01a',
      'alloydb://events/row-ptr-9988221',
    ],
    targetResource: 'k8s-payment-gateway-node-03',
  };

  const startRes = workflowService.startWorkflow(input);
  console.log(`  ✔ Workflow ID: ${startRes.workflowId}`);
  console.log(`  ✔ Initial Active State: ${startRes.state}`);
  console.log('  🔒 Payload Security: Raw customer logs masked; only opaque pointers retained in history.');

  console.log('\n[2/3] Inspecting In-Progress Workflow History & State Machine...');
  const current = workflowService.getWorkflowStatus(workflowId)!;
  for (const item of current.history) {
    console.log(`  ➔ [${item.timestamp}] Transition: ${item.transition} (Ref: ${item.reference})`);
  }

  console.log('\n[3/3] Emitting Temporal Signal: Human Security Lead Approves Containment Action...');
  const humanSignal: HumanDecisionSignal = {
    decisionId: `dec-human-${crypto.randomUUID().slice(0, 6)}`,
    workflowId,
    tenantId,
    authorizingPrincipal: 'lead.investigator@global-security.io',
    verdict: 'APPROVE_CONTAINMENT',
    rationale: 'Telemetry corroborates unauthorized command execution & lateral movement.',
    timestamp: new Date().toISOString(),
  };

  const result = workflowService.recordHumanDecision(humanSignal);
  console.log(`  ✔ Final Workflow Status: ${result.status}`);
  console.log(`  ✔ Verdict Recorded: ${result.finalVerdict}`);
  console.log(`  ⚡ Executed SOAR Actions: [${result.executedActions.join(', ')}]`);
  console.log(`  🔒 Workflow Provenance Attestation: ${result.attestationDigest}`);

  console.log('\n========================================================================');
  console.log(' 🎉 TEMPORAL CASE WORKFLOW SIMULATION COMPLETED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Temporal workflow simulation failed:', err);
  process.exit(1);
});
