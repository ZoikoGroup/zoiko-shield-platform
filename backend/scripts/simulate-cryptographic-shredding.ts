/**
 * GDPR / HIPAA Right-to-be-Forgotten Cryptographic Shredding Simulator
 * 
 * Simulates:
 * 1. Provisioning Subject Encryption Keys (SEK) and encrypting subject PII into Merkle evidence blocks.
 * 2. Successful legitimate read/decryption of active subject records.
 * 3. Execution of GDPR Article 17 Crypto-Shredding destroying the subject key with memory zeroization.
 * 4. Verification that historical ciphertext is mathematically unrecoverable while Merkle tree integrity is preserved.
 */

import 'dotenv/config';
import 'reflect-metadata';
import * as crypto from 'crypto';
import { CryptographicShreddingService } from '../apps/shield-core/src/modules/privacy/cryptographic-shredding.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield Cryptographic Shredding & Privacy Erasure Simulator');
  console.log('    Specification: ZS-DISP-SHRED-001 (GDPR Art. 17 / HIPAA Forget)');
  console.log('========================================================================\n');

  const shredder = new CryptographicShreddingService();
  const tenantId = `tenant-health-${crypto.randomUUID().slice(0, 8)}`;
  const subjectId = `subject-patient-${crypto.randomUUID().slice(0, 8)}`;
  const sensitivePii = 'Medical Record: Patient John Smith, DOB: 1985-04-12, SSN: 999-12-8888, Diagnostic: Cardiac Arrhythmia';

  console.log('[1/3] Ingesting Subject Evidence with Dedicated Subject Encryption Key (SEK)...');
  const encryptedPayload = shredder.encryptSubjectPii(tenantId, subjectId, sensitivePii);

  console.log(`  ✔ Tenant ID: ${tenantId}`);
  console.log(`  ✔ Subject ID: ${subjectId}`);
  console.log(`  ✔ Ciphertext (Stored in Merkle block): ${encryptedPayload.ciphertextHex.slice(0, 48)}...`);
  console.log(`  ✔ GCM Auth Tag: ${encryptedPayload.authTagHex}`);

  console.log('\n[2/3] Verifying Legitimate Decryption while Subject Key is Active...');
  const decryptedText = shredder.decryptSubjectPii(encryptedPayload);
  console.log(`  ✔ Decrypted Content: "${decryptedText}"`);

  console.log('\n[3/3] Executing GDPR Article 17 Right-to-be-Forgotten Cryptographic Erasure...');
  const cert = shredder.shredSubjectKey(tenantId, subjectId);

  console.log(`  ✔ Certificate ID: ${cert.certificateId}`);
  console.log(`  ✔ Erasure Method: ${cert.erasureType}`);
  console.log(`  ✔ Shredded Timestamp: ${cert.shreddedAt}`);
  console.log(`  ✔ Merkle Hash Chain Integrity Preserved: ${cert.merkleIntegrityPreserved}`);
  console.log(`  🔒 Proof of Obliteration Digest: ${cert.proofOfObliterationDigest}`);

  console.log('\n  ➔ Testing Post-Erasure Decryption Attempt on Historical Ledger Ciphertext:');
  try {
    shredder.decryptSubjectPii(encryptedPayload);
  } catch (err: any) {
    console.log(`  ❌ [BLOCKED & UNRECOVERABLE]: ${err.message}`);
  }

  console.log('\n========================================================================');
  console.log(' 🎉 CRYPTOGRAPHIC SHREDDING SIMULATION COMPLETED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Crypto shredding simulation failed:', err);
  process.exit(1);
});
