/**
 * Temporal Durable Containment Orchestration & Escalation Simulator
 * 
 * Simulates:
 * 1. Initiating multi-approver durable containment workflow for critical ransomware host.
 * 2. Simulating timeout trigger that automatically escalates approval from Tier-1 Analyst to Tier-2 SOC Lead.
 * 3. Enforcing FIDO2 hardware step-up MFA challenge before dispatching governed response.
 */

import 'dotenv/config';
import 'reflect-metadata';
import * as crypto from 'crypto';
import {
  TemporalContainmentEscalationService,
  ContainmentWorkflowInput,
} from '../apps/shield-action/src/orchestration/temporal-containment-escalation.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield Temporal Containment & Multi-Approver Escalation Simulator');
  console.log('    Specification: Backend Build Guide §LAB 10 & §LAB 15');
  console.log('========================================================================\n');

  const escalationService = new TemporalContainmentEscalationService();
  const tenantId = `tenant-bank-${crypto.randomUUID().slice(0, 6)}`;
  const workflowId = `wf-contain-${crypto.randomUUID().slice(0, 8)}`;

  console.log('[1/3] Initiating Durable Multi-Approver Containment Workflow...');
  const input: ContainmentWorkflowInput = {
    workflowId,
    tenantId,
    incidentRef: 'INC-2026-BANK-042',
    targetResource: 'srv-k8s-payment-db-01',
    actionType: 'ISOLATE_ENDPOINT',
    initialApprovalTier: 'TIER_1_SOC_ANALYST',
    analystApprovalTimeoutSeconds: 60,
  };

  const wf = escalationService.startContainmentWorkflow(input);
  console.log(`  ✔ Workflow ID: ${wf.workflowId}`);
  console.log(`  ✔ Initial State: ${wf.currentState} (Tier: ${wf.currentTier})`);
  console.log(`  ✔ Target Resource: ${wf.targetResource} | Action: ${wf.actionType}`);

  console.log('\n[2/3] Simulating Approval Timeout Signal (60s Exceeded without Analyst Response)...');
  const escalatedWf = escalationService.handleApprovalTimeout(workflowId);
  console.log(`  ⚠️  Escalated State: ${escalatedWf.currentState}`);
  console.log(`  ⚠️  New Approval Tier: ${escalatedWf.currentTier}`);

  console.log('\n[3/3] SOC Lead Signs Decision with Hardware FIDO2 WebAuthn Token...');
  const resolvedWf = escalationService.recordApprovalWithStepUpMfa(
    workflowId,
    'lead.investigator@bank-corp.com',
    'APPROVE',
    'fido2-hw-key-yubikey-5c-attested',
  );

  console.log(`  ✔ Final Workflow State: ${resolvedWf.currentState}`);
  console.log(`  ✔ MFA Hardware Challenge Verified: ${resolvedWf.mfaChallengeVerified}`);
  console.log(`  ⚡ Executed Action Receipt: ${resolvedWf.actionReceiptId}`);
  console.log(`  🔒 Durable History Attestation: ${resolvedWf.attestationDigest}`);

  console.log('\n========================================================================');
  console.log(' 🎉 TEMPORAL CONTAINMENT ESCALATION SIMULATION COMPLETED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Temporal escalation simulation failed:', err);
  process.exit(1);
});
