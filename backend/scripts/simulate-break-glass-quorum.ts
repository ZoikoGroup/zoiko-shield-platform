/**
 * Shamir (k-of-n) Break-Glass Multi-Sig Quorum Simulator
 * 
 * Simulates:
 * 1. Generating a split master vault break-glass key across 5 enterprise key custodians (3-of-5 threshold).
 * 2. Simulating unauthorized access attempt with insufficient (<3) key shares.
 * 3. Simulating catastrophic emergency break-glass quorum unlock with 3 valid custodian shares.
 */

import 'dotenv/config';
import 'reflect-metadata';
import * as crypto from 'crypto';
import { BreakGlassQuorumService } from '../apps/shield-core/src/modules/break-glass/break-glass-quorum.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield Shamir (k-of-n) Break-Glass Quorum Simulator');
  console.log('    Specification: ZS-SEC-KEY-001 §9 & ZS-SOAR-DISP-001 §6');
  console.log('========================================================================\n');

  const quorumService = new BreakGlassQuorumService();
  const tenantId = `tenant-bank-${crypto.randomUUID().slice(0, 8)}`;
  const masterEmergencySecret = 'VAULT_MASTER_ROOT_KEY_SHRED_RECOVERY_KEY_2026_ALPHA';

  console.log('[1/3] Provisioning Shamir Secret Sharing Quorum Session (3-of-5 Threshold)...');
  const session = quorumService.generateBreakGlassShares({
    tenantId,
    secretText: masterEmergencySecret,
    thresholdK: 3,
    totalSharesN: 5,
    custodians: [
      { custodianId: 'custodian-ciso-sarah', custodianRole: 'CHIEF_INFORMATION_SECURITY_OFFICER' },
      { custodianId: 'custodian-dpo-marcus', custodianRole: 'DATA_PROTECTION_OFFICER' },
      { custodianId: 'custodian-secops-elena', custodianRole: 'LEAD_SECOPS_ENGINEER' },
      { custodianId: 'custodian-vp-infra-chen', custodianRole: 'VP_INFRASTRUCTURE' },
      { custodianId: 'custodian-general-counsel', custodianRole: 'GENERAL_COUNSEL' },
    ],
  });

  console.log(`  ✔ Vault Session ID: ${session.sessionId}`);
  console.log(`  ✔ Policy: Threshold K=${session.thresholdK} of Total N=${session.totalSharesN} Custodians`);
  for (const s of session.custodianShares) {
    console.log(`    - Custodian [${s.custodianId}] (${s.custodianRole}) -> Share #${s.shareIndex}: ${s.shareHex.slice(0, 24)}...`);
  }

  console.log('\n[2/3] Simulating Unauthorized Break-Glass Attempt with Insufficient Shares (2 Custodians)...');
  const insufficientShares = [session.custodianShares[0], session.custodianShares[1]];
  try {
    quorumService.reconstructMasterSecret(insufficientShares, session.thresholdK);
  } catch (err: any) {
    console.log(`  🚨 [QUORUM REJECTED]: ${err.message}`);
  }

  console.log('\n[3/3] Simulating Catastrophic Incident Break-Glass Quorum Execution (3 Custodians)...');
  console.log('  ➔ Presenting shares from: CISO Sarah, Lead Elena, and VP Infra Chen...');
  const quorumShares = [session.custodianShares[0], session.custodianShares[2], session.custodianShares[3]];

  const recoveryResult = quorumService.reconstructMasterSecret(quorumShares, session.thresholdK);

  console.log(`  ✔ Unlock Session: ${recoveryResult.sessionId}`);
  console.log(`  ✔ Quorum Threshold Satisfied: ${recoveryResult.quorumMet} (3/3 valid shares evaluated)`);
  console.log(`  ✔ Participating Custodians: ${recoveryResult.participatingCustodians.join(', ')}`);
  console.log(`  ✔ Recovered Secret: "${recoveryResult.recoveredSecret}"`);
  console.log(`  ✔ Secret Integrity Match: ${recoveryResult.recoveredSecret === masterEmergencySecret}`);
  console.log(`  🔒 Break-Glass Attestation Digest: ${recoveryResult.breakGlassAttestationDigest}`);

  console.log('\n========================================================================');
  console.log(' 🎉 SHAMIR BREAK-GLASS QUORUM SIMULATION COMPLETED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Break-Glass simulation failed:', err);
  process.exit(1);
});
