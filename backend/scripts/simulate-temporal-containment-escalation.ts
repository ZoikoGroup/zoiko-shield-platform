/**
 * Durable Containment Orchestration & Escalation Simulator
 *
 * Simulates:
 * 1. Initiating multi-approver durable containment workflow for critical ransomware host,
 *    persisted to Postgres (DurableWorkflowInstance/DurableWorkflowTransition) rather than
 *    an in-process Map, so it survives a restart.
 * 2. Simulating timeout trigger that automatically escalates approval from Tier-1 Analyst to Tier-2 SOC Lead.
 * 3. Enforcing FIDO2 hardware step-up MFA challenge before dispatching governed response.
 * 4. Resuming the workflow from a second, independent service instance sharing no in-process
 *    state with the one that wrote it — the concrete proof of durability.
 *
 * Requires a real DATABASE_URL with the `action` schema migrated
 * (DurableWorkflowInstance/DurableWorkflowTransition — see prisma/schemas/action.prisma).
 */

import 'dotenv/config';
import 'reflect-metadata';
import * as crypto from 'crypto';
import { PrismaService } from '../apps/shield-action/src/prisma/prisma.service';
import {
  DurableContainmentEscalationService,
  ContainmentWorkflowInput,
} from '../apps/shield-action/src/orchestration/durable-containment-escalation.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield Durable Containment & Multi-Approver Escalation Simulator');
  console.log('    Specification: Backend Build Guide §LAB 10 & §LAB 15');
  console.log('========================================================================\n');

  const prisma = new PrismaService();
  await prisma.$connect();

  try {
    // Two independent service instances sharing the same Postgres connection
    // but no JS-level state — a stand-in for two separate processes/pods.
    const writer = new DurableContainmentEscalationService(prisma);
    const reader = new DurableContainmentEscalationService(prisma);

    const tenantId = `tenant-bank-${crypto.randomUUID().slice(0, 6)}`;
    const workflowId = `wf-contain-${crypto.randomUUID().slice(0, 8)}`;

    console.log('[1/4] Initiating Durable Multi-Approver Containment Workflow...');
    const input: ContainmentWorkflowInput = {
      workflowId,
      tenantId,
      incidentRef: 'INC-2026-BANK-042',
      targetResource: 'srv-k8s-payment-db-01',
      actionType: 'ISOLATE_ENDPOINT',
      initialApprovalTier: 'TIER_1_SOC_ANALYST',
      analystApprovalTimeoutSeconds: 60,
    };

    const wf = await writer.startContainmentWorkflow(input);
    console.log(`  ✔ Workflow ID: ${wf.workflowId}`);
    console.log(`  ✔ Initial State: ${wf.currentState} (Tier: ${wf.currentTier})`);
    console.log(`  ✔ Target Resource: ${wf.targetResource} | Action: ${wf.actionType}`);

    console.log('\n[2/4] Resuming from an independent service instance (durability proof)...');
    const resumed = await reader.resumeWorkflow(workflowId, tenantId);
    console.log(`  ✔ Resumed State: ${resumed.currentState} (read by an instance that never wrote it)`);

    console.log('\n[3/4] Simulating Approval Timeout Signal (60s Exceeded without Analyst Response)...');
    const escalatedWf = await writer.handleApprovalTimeout(workflowId, tenantId);
    console.log(`  ⚠️  Escalated State: ${escalatedWf.currentState}`);
    console.log(`  ⚠️  New Approval Tier: ${escalatedWf.currentTier}`);

    console.log('\n[4/4] SOC Lead Signs Decision with Hardware FIDO2 WebAuthn Token...');
    const resolvedWf = await writer.recordApprovalWithStepUpMfa(
      workflowId,
      tenantId,
      'lead.investigator@bank-corp.com',
      'APPROVE',
      'fido2-hw-key-yubikey-5c-attested',
    );

    console.log(`  ✔ Final Workflow State: ${resolvedWf.currentState}`);
    console.log(`  ✔ MFA Hardware Challenge Verified: ${resolvedWf.mfaChallengeVerified}`);
    console.log(`  ⚡ Executed Action Receipt: ${resolvedWf.actionReceiptId}`);
    console.log(`  🔒 Durable History Attestation: ${resolvedWf.attestationDigest}`);

    console.log('\n========================================================================');
    console.log(' 🎉 DURABLE CONTAINMENT ESCALATION SIMULATION COMPLETED!');
    console.log('========================================================================\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('❌ Durable escalation simulation failed:', err);
  process.exit(1);
});
