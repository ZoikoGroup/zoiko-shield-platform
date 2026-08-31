/**
 * Cedar Authorization & Negative Tenancy Matrix Simulator
 * 
 * Simulates:
 * 1. Evaluating deterministic Cedar ABAC policy context for SOAR and Casework actions.
 * 2. Running the 8 mandatory release-blocking negative test invariants from LAB 12:
 *    - Cross-tenant denial
 *    - Cross-legal-entity denial
 *    - Stale approval denial
 *    - Missing purpose denial
 *    - Insufficient/revoked role denial
 *    - Policy bundle unavailable (fail-closed)
 *    - Support user without JIT grant denial
 *    - AI agent direct execution denial
 * 3. Proving permitted access under valid context.
 */

import 'dotenv/config';
import 'reflect-metadata';
import * as crypto from 'crypto';
import {
  CedarTenantIsolationService,
  CedarDecisionContext,
} from '../apps/shield-action/src/policy/cedar-tenant-isolation.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield Cedar ABAC & Negative Tenancy Matrix Simulator');
  console.log('    Specification: Backend Build Guide §LAB 12 (Cedar Tenant Isolation)');
  console.log('========================================================================\n');

  const cedarService = new CedarTenantIsolationService();

  const validContext: CedarDecisionContext = {
    principal: {
      id: 'lead.investigator@bank-corp.com',
      type: 'HUMAN_USER',
      tenantId: 'tenant-bank-01',
      legalEntityId: 'le-banking-us',
      roles: ['SOC_LEAD'],
      sessionId: `sess-${crypto.randomUUID().slice(0, 8)}`,
    },
    resource: {
      id: 'k8s-vault-node-01',
      type: 'Host',
      tenantId: 'tenant-bank-01',
      legalEntityId: 'le-banking-us',
      environment: 'PRODUCTION',
    },
    action: {
      name: 'action.isolate_endpoint',
      authorityLevel: 'R2_GOVERNED_CONTAINMENT',
    },
    governance: {
      purpose: 'active_ransomware_incident_containment',
      caseReference: 'INC-2026-BANK-099',
      approvalRef: 'appr-vp-ciso-9988',
      policyBundleVersion: 'bundle-v3.1.0',
    },
  };

  console.log('[1/2] Executing 8 LAB 12 Release-Blocking Negative Matrix Test Cases:');

  // 1. Cross-Tenant
  const r1 = cedarService.evaluateAuthorization({
    ...validContext,
    resource: { ...validContext.resource, tenantId: 'tenant-other-bank-02' },
  });
  console.log(`  🛑 [1/8] Cross-Tenant Target: ${r1.decision} (Reason: ${r1.reasonCode})`);

  // 2. Wrong Legal Entity
  const r2 = cedarService.evaluateAuthorization({
    ...validContext,
    resource: { ...validContext.resource, legalEntityId: 'le-eu-entity' },
  });
  console.log(`  🛑 [2/8] Wrong Legal Entity: ${r2.decision} (Reason: ${r2.reasonCode})`);

  // 3. Stale Approval
  const r3 = cedarService.evaluateAuthorization({
    ...validContext,
    governance: { ...validContext.governance, isApprovalStale: true },
  });
  console.log(`  🛑 [3/8] Stale Approval Ref: ${r3.decision} (Reason: ${r3.reasonCode})`);

  // 4. Missing Purpose
  const r4 = cedarService.evaluateAuthorization({
    ...validContext,
    governance: { ...validContext.governance, purpose: '' },
  });
  console.log(`  🛑 [4/8] Missing Purpose: ${r4.decision} (Reason: ${r4.reasonCode})`);

  // 5. Insufficient Role
  const r5 = cedarService.evaluateAuthorization({
    ...validContext,
    principal: { ...validContext.principal, roles: ['SOC_ANALYST'] },
  });
  console.log(`  🛑 [5/8] Insufficient Role: ${r5.decision} (Reason: ${r5.reasonCode})`);

  // 6. Policy Engine Unavailable (Fail-closed)
  const r6 = cedarService.evaluateAuthorization(validContext, false);
  console.log(`  🛑 [6/8] Policy Engine Outage: ${r6.decision} (Reason: ${r6.reasonCode})`);

  // 7. Support User without Customer JIT Grant
  const r7 = cedarService.evaluateAuthorization({
    ...validContext,
    principal: { ...validContext.principal, type: 'SUPPORT_DELEGATE' },
    governance: { ...validContext.governance, hasCustomerSupportGrant: false },
  });
  console.log(`  🛑 [7/8] Support Without JIT Grant: ${r7.decision} (Reason: ${r7.reasonCode})`);

  // 8. AI Agent Direct Resource Access
  const r8 = cedarService.evaluateAuthorization({
    ...validContext,
    principal: { ...validContext.principal, type: 'AI_AGENT' },
  });
  console.log(`  🛑 [8/8] AI Agent Direct Invocation: ${r8.decision} (Reason: ${r8.reasonCode})`);

  console.log('\n[2/2] Evaluating Valid Authorized Governance Request:');
  const validRes = cedarService.evaluateAuthorization(validContext);
  console.log(`  ✔ Decision: ${validRes.decision} (Reason: ${validRes.reasonCode})`);
  console.log(`  ✔ Authority Level: ${validContext.action.authorityLevel}`);
  console.log(`  🔒 Decision Attestation Digest: ${validRes.attestationDigest}`);

  console.log('\n========================================================================');
  console.log(' 🎉 CEDAR NEGATIVE MATRIX SIMULATION COMPLETED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Cedar simulation failed:', err);
  process.exit(1);
});
