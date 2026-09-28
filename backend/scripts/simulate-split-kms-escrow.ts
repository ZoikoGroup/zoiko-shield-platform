/**
 * Split-Key Sovereign Escrow Simulator (real GCP Cloud KMS wrapping)
 *
 * Simulates:
 * 1. Generating a high-entropy 256-bit AES-GCM data key.
 * 2. Splitting the key into 3 XOR shares.
 * 3. Wrapping each share with a distinct, real GCP Cloud KMS key (requires
 *    real GCP credentials and 3 existing KMS keys at the resource names below).
 * 4. Reconstructing the plaintext master key from the 3 wrapped shares.
 *
 * This platform hosts only on GCP (ADR-16) — no AWS/Azure KMS client exists
 * in this codebase — so all 3 shares are wrapped by distinct GCP keys rather
 * than 3 different cloud vendors. See SplitKmsEscrowService's doc comment
 * for the security-property trade-off that implies.
 */

import 'dotenv/config';
import 'reflect-metadata';
import * as crypto from 'crypto';
import { SplitKmsEscrowService } from '../apps/shield-core/src/modules/crypto-escrow/split-kms-escrow.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield Split-Key Sovereign Escrow Simulator');
  console.log('    Specification: ZS-SEC-KEY-001 §11 (Cryptographic Escrow)');
  console.log('========================================================================\n');

  const escrowService = new SplitKmsEscrowService();
  const tenantId = `tenant-sovereign-eu-${crypto.randomUUID().slice(0, 6)}`;

  const config = {
    gcpKmsKeyNames: [
      'projects/sovereign-core/locations/europe-west3/keyRings/kr1/cryptoKeys/escrow-share-1',
      'projects/sovereign-core/locations/europe-west3/keyRings/kr1/cryptoKeys/escrow-share-2',
      'projects/sovereign-core/locations/europe-west3/keyRings/kr1/cryptoKeys/escrow-share-3',
    ] as [string, string, string],
  };

  console.log('[1/3] Generating Master Evidence Vault Key & Splitting into 3 GCP KMS-Wrapped Shares...');
  const { masterKeyHex, wrappedPackage } = await escrowService.generateAndWrapSplitMasterKey(
    tenantId,
    'SOVEREIGN_EVIDENCE_LEDGER_ENCRYPTION',
    config,
  );

  console.log(`  ✔ Generated Master Key (256-bit): 0x${masterKeyHex.slice(0, 32)}...`);
  console.log(`  ✔ Key ID: ${wrappedPackage.keyId}`);
  console.log(`  ✔ Splitting Scheme: ${wrappedPackage.splitScheme}`);

  console.log('\n[2/3] Inspecting GCP KMS-Wrapped Escrow Shares:');
  for (const share of wrappedPackage.shares) {
    console.log(`  ➔ Key: ${share.keyResourceIdentifier}`);
    console.log(`     Wrapped Share: ${share.wrappedShareBase64.slice(0, 32)}...`);
  }
  console.log(`  🔒 Escrow Attestation Digest: ${wrappedPackage.attestationDigest}`);

  console.log('\n[3/3] Simulating Sovereign Vault Decryption: Unwrapping all 3 Shares...');
  const reconstructedHex = await escrowService.unwrapAndReconstructMasterKey(wrappedPackage);

  console.log(`  ✔ Reconstructed Key: 0x${reconstructedHex.slice(0, 32)}...`);
  console.log(`  ✔ Exact Match: ${reconstructedHex === masterKeyHex} (no single KMS key holds enough to reconstruct alone)`);

  console.log('\n========================================================================');
  console.log(' 🎉 SPLIT-KEY SOVEREIGN ESCROW SIMULATION COMPLETED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Split KMS simulation failed:', err);
  process.exit(1);
});
