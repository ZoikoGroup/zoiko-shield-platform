/**
 * Cloud HSM Asymmetric Signing & Emergency Out-of-Band Freeze Engine Simulator
 * 
 * Simulates:
 * 1. Cloud HSM ECDSA P-256 asymmetric signature generation and verification on high-consequence SOAR commands.
 * 2. Enterprise emergency kill-switch lockdown preventing unauthorized live executions during active zero-days.
 * 3. Scope-based freeze targeting (Global, Tenant, Connector, Action Type) and safe release.
 */

import 'dotenv/config';
import 'reflect-metadata';
import * as crypto from 'crypto';
import { CloudHsmSignerService } from '../apps/shield-action/src/command-signing/cloud-hsm-signer.service';
import { EmergencyFreezeLockdownService } from '../apps/shield-action/src/freeze-controller/emergency-freeze-lockdown.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield Cloud HSM Signing & Emergency Freeze Controls Simulator');
  console.log('    Specification: ZS-T0-TECH-001 §5.3 (Cloud HSM & Freeze Mechanics)');
  console.log('========================================================================\n');

  const hsmSigner = new CloudHsmSignerService();
  const freezeService = new EmergencyFreezeLockdownService();
  const tenantId = `tenant-${crypto.randomUUID().slice(0, 8)}`;

  console.log('[1/3] Initializing FIPS 140-3 Level 3 Cloud HSM Asymmetric Enclave...');
  const keyMeta = hsmSigner.getActiveKeyMetadata();
  console.log(`  ✔ Active HSM Key ID: ${keyMeta.keyId}`);
  console.log(`  ✔ Signature Algorithm: ${keyMeta.algorithm}`);
  console.log(`  ✔ Hardware Enclave: ${keyMeta.hsmEnclaveId} (${keyMeta.fipsLevel})`);

  // Sign a high-consequence live SOAR command
  const liveCommand = {
    tenantId,
    actionCommandId: `cmd-${crypto.randomUUID()}`,
    nonce: crypto.randomBytes(16).toString('hex'),
    payload: {
      actionType: 'ISOLATE_ENDPOINT',
      target: 'srv-prod-kubernetes-master-01.corp.internal',
      reason: 'Automated Cortex XDR Ransomware Mitigation',
    },
  };

  console.log('\n[2/3] Signing Live SOAR Remediation Command with Cloud HSM...');
  const signed = hsmSigner.sign(liveCommand, 'LIVE');
  console.log(`  ✔ Signed By: ${signed.signedBy}`);
  console.log(`  ✔ Signature: ${signed.signature.slice(0, 48)}...`);
  console.log(`  ✔ Timestamp: ${signed.signedAt}`);

  const isVerified = hsmSigner.verifySignature(liveCommand, 'LIVE', signed.signature);
  console.log(`  ✔ Signature Cryptographic Verification: ${isVerified ? 'VALID (MATCHED PUBLIC KEY)' : 'FAILED'}`);

  // Emergency Freeze Testing
  console.log('\n[3/3] Simulating Out-of-Band Emergency Kill-Switch (Freeze Controls)...');

  // Baseline: No freeze
  console.log('  ➔ Testing execution before freeze:');
  freezeService.assertNotFrozen({ tenantId, actionType: 'ISOLATE_ENDPOINT' });
  console.log('    ✔ Status: NORMAL (Execution Authorized)');

  // Engage Tenant Freeze
  console.log('\n  ➔ Engaging Emergency Tenant Freeze due to Active Compromise...');
  const freeze = freezeService.engageFreeze({
    scope: 'TENANT',
    tenantId,
    reason: 'Containment of active CobaltStrike beaconing in cluster',
    initiatedBy: 'secops-lead@zoiko.com',
    durationMinutes: 60,
  });
  console.log(`    🚨 Freeze Engaged: ${freeze.freezeId} | Reason: ${freeze.reason}`);
  console.log(`    🔒 Immutable Refusal Digest: ${freeze.immutableRefusalDigest}`);

  // Test execution under freeze
  console.log('\n  ➔ Attempting live SOAR execution while under lockdown:');
  try {
    freezeService.assertNotFrozen({ tenantId, actionType: 'ISOLATE_ENDPOINT' });
  } catch (err: any) {
    console.log(`    ❌ [BLOCKED AS EXPECTED]: ${err.message}`);
  }

  // Release Freeze
  console.log('\n  ➔ Authorized SecOps Release of Emergency Freeze...');
  freezeService.releaseFreeze(freeze.freezeId, 'ciso@zoiko.com');
  freezeService.assertNotFrozen({ tenantId, actionType: 'ISOLATE_ENDPOINT' });
  console.log('    ✔ Status: RESTORED (Execution Authorized After Investigation)');

  console.log('\n========================================================================');
  console.log(' 🎉 CLOUD HSM SIGNING & EMERGENCY FREEZE SIMULATION COMPLETED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ HSM/Freeze simulation failed:', err);
  process.exit(1);
});
