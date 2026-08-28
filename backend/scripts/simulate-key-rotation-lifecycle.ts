/**
 * Cryptographic Key Rotation & Forward-Secrecy Lifecycle Simulator
 * 
 * Simulates:
 * 1. Initial provisioning of Tenant Master Key (TMK) v1 for a compliant enterprise tenant.
 * 2. Automated 90-day crypto-period rollover with state progression (ACTIVE -> RETIRED_READ_ONLY).
 * 3. Generation of cryptographic forward-secrecy derivation proofs for tenant audit ledger re-anchoring.
 */

import 'dotenv/config';
import 'reflect-metadata';
import * as crypto from 'crypto';
import { KeyRotationOrchestratorService } from '../apps/shield-core/src/modules/crypto-governance/key-rotation-orchestrator.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield Cryptographic Key Rotation & Forward-Secrecy Simulator');
  console.log('    Specification: ZS-SEC-KEY-001 (Crypto-Period Management & Lineage)');
  console.log('========================================================================\n');

  const keyOrchestrator = new KeyRotationOrchestratorService();
  const tenantId = `tenant-${crypto.randomUUID().slice(0, 8)}`;

  console.log('[1/3] Provisioning Tenant Master Key (TMK) v1 for New Enterprise Tenant...');
  const tmkV1 = keyOrchestrator.initializeTenantMasterKey(tenantId);

  console.log(`  ✔ Tenant ID: ${tenantId}`);
  console.log(`  ✔ Key ID: ${tmkV1.keyId}`);
  console.log(`  ✔ Key Version: v${tmkV1.version}`);
  console.log(`  ✔ Status: ${tmkV1.status}`);
  console.log(`  ✔ Algorithm: ${tmkV1.algorithm}`);
  console.log(`  ✔ Crypto-Period Expiry: ${tmkV1.expiresAt}`);
  console.log(`  🔒 Key Material Digest: ${tmkV1.derivedKeyDigest.slice(0, 32)}...`);

  console.log('\n[2/3] Simulating Automated 90-Day Crypto-Period Key Rotation...');
  const rotationReceipt = keyOrchestrator.rotateTenantMasterKey(tenantId);

  console.log(`  ✔ Rotation ID: ${rotationReceipt.rotationId}`);
  console.log(`  ✔ Old Key ID (Retired): ${rotationReceipt.oldKeyId}`);
  console.log(`  ✔ New Key ID (Active): ${rotationReceipt.newKeyId}`);
  console.log(`  ✔ New Key Version: v${rotationReceipt.newVersion}`);
  console.log(`  ✔ Rotation Timestamp: ${rotationReceipt.rotatedAt}`);
  console.log(`  🔒 Forward-Secrecy Proof Digest: ${rotationReceipt.forwardSecrecyProofDigest}`);

  console.log('\n[3/3] Inspecting Tenant Cryptographic Keyring & Status Lineage:');
  const allKeys = keyOrchestrator.getTenantKeys(tenantId);
  for (const k of allKeys) {
    console.log(`    - [v${k.version}] Key: ${k.keyId} | Status: ${k.status} | Expires: ${k.expiresAt}`);
  }

  console.log('\n========================================================================');
  console.log(' 🎉 CRYPTOGRAPHIC KEY ROTATION SIMULATION COMPLETED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Key rotation simulation failed:', err);
  process.exit(1);
});
