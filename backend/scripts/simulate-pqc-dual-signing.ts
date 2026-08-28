/**
 * Post-Quantum Cryptography (PQC) Hybrid Dual-Signing Simulator
 * 
 * Simulates:
 * 1. Hybrid Classical ECDSA P-256 + Quantum-Resistant ML-DSA-65 (NIST FIPS 204) signature generation.
 * 2. Independent multi-algorithm signature verification and tamper detection.
 * 3. Future-proof attestation container formatting for long-term compliance storage.
 */

import 'dotenv/config';
import 'reflect-metadata';
import * as crypto from 'crypto';
import { PqcDualSignerService } from '../apps/shield-anchor/src/signing/pqc-dual-signer.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield Post-Quantum Hybrid Dual-Signing Simulator');
  console.log('    Specification: ZS-T0-TECH-001 §5.3 & ZS-T0-AUD-001 §8');
  console.log('========================================================================\n');

  const pqcSigner = new PqcDualSignerService();
  const epochMerkleRoot = crypto.createHash('sha256').update('CANONICAL_EPOCH_ROOT_2026').digest('hex');

  console.log('[1/3] Signing Epoch Merkle Root with Classical + Post-Quantum Lattice Dual Signer...');
  console.log(`  ➔ Target Merkle Root: ${epochMerkleRoot}`);

  const dualSignature = await pqcSigner.signHybrid(epochMerkleRoot);

  console.log(`  ✔ Signature ID: ${dualSignature.signatureId}`);
  console.log(`  ✔ Algorithm Suite: ${dualSignature.algorithmSuite}`);
  console.log(`  ✔ Key ID: ${dualSignature.keyId}`);
  console.log(`  ✔ Classical ECDSA Signature: ${dualSignature.classicalSignatureHex.slice(0, 48)}...`);
  console.log(`  ✔ Post-Quantum ML-DSA-65 Signature: ${dualSignature.pqcSignatureHex.slice(0, 48)}...`);
  console.log(`  ✔ Combined Base64 Container: ${dualSignature.hybridCombinedSignatureBase64.slice(0, 64)}...`);

  console.log('\n[2/3] Verifying Genuine Hybrid Dual-Signature...');
  const validVerification = pqcSigner.verifyHybrid(epochMerkleRoot, dualSignature);
  console.log(`  ✔ Verification Status: ${validVerification.isValid ? '✅ VALID DUAL SIGNATURE' : '❌ INVALID'}`);
  console.log(`  ✔ Classical Signature Status: ${validVerification.classicalValid ? 'VALID' : 'INVALID'}`);
  console.log(`  ✔ Post-Quantum Signature Status: ${validVerification.pqcValid ? 'VALID' : 'INVALID'}`);
  console.log(`  ✔ Tamper Detected: ${validVerification.tamperDetected ? 'ALERT: TAMPER DETECTED' : 'CLEAN'}`);

  console.log('\n[3/3] Simulating Malicious Tampering of Anchored Merkle Root...');
  const tamperedRoot = crypto.createHash('sha256').update('MALICIOUS_EPOCH_ROOT_ATTACK').digest('hex');
  const tamperedVerification = pqcSigner.verifyHybrid(tamperedRoot, dualSignature);
  console.log(`  ➔ Tampered Payload: ${tamperedRoot.slice(0, 32)}...`);
  console.log(`  🚨 Tamper Verification Status: ${tamperedVerification.isValid ? 'VALID' : '❌ SIGNATURE REJECTED'}`);
  console.log(`  🚨 Tamper Detected Flag: ${tamperedVerification.tamperDetected}`);

  console.log('\n========================================================================');
  console.log(' 🎉 POST-QUANTUM HYBRID DUAL-SIGNING SIMULATION COMPLETED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ PQC Dual Signing simulation failed:', err);
  process.exit(1);
});
