/**
 * Cross-Cloud Sovereign Key Escrow & Split KMS Simulator
 * 
 * Simulates:
 * 1. Generating a high-entropy 256-bit AES-GCM data key.
 * 2. Splitting the key into 3 XOR shares across independent cloud providers (AWS, Azure, GCP).
 * 3. Enveloping each share with provider-native KMS root keys.
 * 4. Reconstructing the plaintext master key from the multi-cloud shares.
 */

import 'dotenv/config';
import 'reflect-metadata';
import * as crypto from 'crypto';
import { SplitKmsEscrowService } from '../apps/shield-core/src/modules/crypto-escrow/split-kms-escrow.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield Cross-Cloud Sovereign Key Escrow Simulator');
  console.log('    Specification: ZS-SEC-KEY-001 §11 (Multi-Cloud Cryptographic Escrow)');
  console.log('========================================================================\n');

  const escrowService = new SplitKmsEscrowService();
  const tenantId = `tenant-sovereign-eu-${crypto.randomUUID().slice(0, 6)}`;

  const config = {
    awsKmsKeyArn: 'arn:aws:kms:eu-central-1:998877665544:key/sovereign-vault-root',
    azureKeyVaultUri: 'https://sovereign-secops-vault.vault.azure.net/keys/escrow-key-01',
    gcpKmsKeyName: 'projects/sovereign-core/locations/europe-west3/keyRings/kr1/cryptoKeys/master-k1',
  };

  console.log('[1/3] Generating Master Evidence Vault Key & Splitting across 3 Cloud Providers...');
  const { masterKeyHex, wrappedPackage } = escrowService.generateAndWrapSplitMasterKey(
    tenantId,
    'SOVEREIGN_EVIDENCE_LEDGER_ENCRYPTION',
    config,
  );

  console.log(`  ✔ Generated Master Key (256-bit): 0x${masterKeyHex.slice(0, 32)}...`);
  console.log(`  ✔ Key ID: ${wrappedPackage.keyId}`);
  console.log(`  ✔ Splitting Scheme: ${wrappedPackage.splitScheme}`);

  console.log('\n[2/3] Inspecting Multi-Cloud Encrypted Escrow Shares:');
  for (const share of wrappedPackage.shares) {
    console.log(`  ➔ [${share.provider}] Resource: ${share.keyResourceIdentifier}`);
    console.log(`     Ciphertext: 0x${share.encryptedShareHex.slice(0, 32)}... | AuthTag: ${share.authTagHex}`);
  }
  console.log(`  🔒 Escrow Attestation Digest: ${wrappedPackage.attestationDigest}`);

  console.log('\n[3/3] Simulating Sovereign Vault Decryption: Unwrapping from all 3 Clouds...');
  const reconstructedHex = escrowService.unwrapAndReconstructMasterKey(wrappedPackage);

  console.log(`  ✔ Reconstructed Key: 0x${reconstructedHex.slice(0, 32)}...`);
  console.log(`  ✔ Exact Match: ${reconstructedHex === masterKeyHex} (Zero plaintext leakage on single CSP)`);

  console.log('\n========================================================================');
  console.log(' 🎉 CROSS-CLOUD KEY ESCROW SIMULATION COMPLETED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Split KMS simulation failed:', err);
  process.exit(1);
});
