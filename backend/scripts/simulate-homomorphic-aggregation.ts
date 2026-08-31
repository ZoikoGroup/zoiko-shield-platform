/**
 * Partially Homomorphic Encryption (PHE) Telemetry Aggregator Simulator
 * 
 * Simulates:
 * 1. Generating Paillier cryptosystem public and private parameters.
 * 2. Encrypting sensitive multi-tenant statistical data points into Paillier ciphertexts.
 * 3. Computing aggregate metric summation homomorphically in the encrypted domain without decryption.
 * 4. Verifying mathematical correctness upon authorized master decryption.
 */

import 'dotenv/config';
import 'reflect-metadata';
import { PaillierHomomorphicAggregatorService } from '../apps/shield-core/src/modules/homomorphic/paillier-homomorphic-aggregator.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield Paillier Homomorphic Encryption Aggregator Simulator');
  console.log('    Specification: ZS-AI-SEC-001 §8 (Homomorphic Cryptosystem)');
  console.log('========================================================================\n');

  const homoService = new PaillierHomomorphicAggregatorService();

  console.log('[1/3] Generating Paillier Public Parameters (n, g, n^2)...');
  console.log(`  ✔ Modulus N: ${homoService.publicKey.n}`);
  console.log(`  ✔ Modulus N^2: ${homoService.publicKey.nSquared}`);
  console.log(`  ✔ Generator g: ${homoService.publicKey.g}`);

  console.log('\n[2/3] Encrypting Commercial API Billing Metering Units per Tenant...');
  const tenantValues = [
    { tenantId: 'tenant-fintech-alpha', rawUnits: 140 },
    { tenantId: 'tenant-defense-bravo', rawUnits: 260 },
    { tenantId: 'tenant-healthcare-gamma', rawUnits: 100 },
  ];

  const encryptedPayloads = tenantValues.map((t) => {
    const ciphertext = homoService.encrypt(t.rawUnits);
    console.log(`  🔒 Encrypted Tenant [${t.tenantId}]: Raw=${t.rawUnits} -> Ciphertext=0x${ciphertext.toString(16)}`);
    return {
      metricName: 'soar_playbook_executions_count',
      tenantId: t.tenantId,
      ciphertextHex: ciphertext.toString(16),
    };
  });

  console.log('\n[3/3] Homomorphically Summing Ciphertexts in Encrypted Domain (c_sum = c1 * c2 * c3 mod n^2)...');
  const aggregationReceipt = homoService.aggregateEncryptedMetrics(
    'soar_playbook_executions_count',
    encryptedPayloads,
  );

  console.log(`  ✔ Receipt ID: ${aggregationReceipt.receiptId}`);
  console.log(`  ✔ Aggregated Ciphertext: 0x${aggregationReceipt.aggregatedCiphertextHex}`);
  console.log(`  ✔ Total Contributing Tenants: ${aggregationReceipt.contributingTenantsCount}`);
  console.log(`  ✔ Decrypted Verification Sum: ${aggregationReceipt.decryptedVerificationSum} units`);
  console.log(`  ✔ Mathematical Exactness: ${aggregationReceipt.decryptedVerificationSum === 140 + 260 + 100} (140 + 260 + 100 = 500)`);
  console.log(`  🔒 Homomorphic Attestation Digest: ${aggregationReceipt.attestationDigest}`);

  console.log('\n========================================================================');
  console.log(' 🎉 HOMOMORPHIC ENCRYPTION AGGREGATION SIMULATION COMPLETED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Homomorphic simulation failed:', err);
  process.exit(1);
});
