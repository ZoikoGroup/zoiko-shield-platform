/**
 * RFC 3161 TSA Epoch Anchor & Multi-Tenant Witness Sealing Simulator
 * 
 * Simulates:
 * 1. Aggregation of tenant Merkle roots into a global epoch tree (ZS-MERKLE-V1).
 * 2. RFC 3161 Trusted Time-Stamp Authority (TSA) cryptographic attestation.
 * 3. Issuance of multi-tenant inclusion proofs for offline auditor verification.
 */

import 'dotenv/config';
import 'reflect-metadata';
import * as crypto from 'crypto';
import { EpochAggregatorService } from '../apps/shield-anchor/src/merkle/epoch-aggregator.service';
import { MerkleTreeService } from '../apps/shield-anchor/src/merkle/merkle-tree.service';
import { Rfc3161WitnessService } from '../apps/shield-anchor/src/witnesses/rfc3161/rfc3161-witness.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield RFC 3161 TSA Epoch Anchor & Witness Sealing Simulator');
  console.log('    Specification: ZS-T0-TECH-001 §5.4 (Evidence Anchor Satellite)');
  console.log('========================================================================\n');

  const merkleService = new MerkleTreeService();
  const rfc3161Witness = new Rfc3161WitnessService();
  const epochAggregator = new EpochAggregatorService(merkleService, rfc3161Witness);

  console.log('[1/3] Collecting Tenant Merkle Heads for Current 5-Minute Epoch Window...');
  const activeTenants = [
    {
      tenantId: 'tenant-global-bank-01',
      tenantMerkleRoot: crypto.createHash('sha256').update('LEDGER_HEAD_BANK').digest('hex'),
      evidenceRecordsCount: 240,
    },
    {
      tenantId: 'tenant-defense-aerospace-02',
      tenantMerkleRoot: crypto.createHash('sha256').update('LEDGER_HEAD_DEFENSE').digest('hex'),
      evidenceRecordsCount: 512,
    },
    {
      tenantId: 'tenant-health-genomics-03',
      tenantMerkleRoot: crypto.createHash('sha256').update('LEDGER_HEAD_HEALTH').digest('hex'),
      evidenceRecordsCount: 128,
    },
  ];

  for (const t of activeTenants) {
    console.log(`  ➔ Tenant: ${t.tenantId} | Head Root: ${t.tenantMerkleRoot.slice(0, 24)}... (${t.evidenceRecordsCount} evidence blocks)`);
  }

  console.log('\n[2/3] Sealing Global Epoch Merkle Checkpoint with RFC 3161 TSA Witness...');
  const epochReceipt = await epochAggregator.sealEpoch(activeTenants);

  console.log(`  ✔ Epoch ID: ${epochReceipt.epochId} (Epoch #${epochReceipt.epochNumber})`);
  console.log(`  ✔ Global Epoch Root: ${epochReceipt.globalEpochRoot}`);
  console.log(`  ✔ Participating Tenants: ${epochReceipt.tenantsCount} | Total Evidence: ${epochReceipt.totalEvidenceCount}`);
  console.log(`  ✔ TSA Witness Type: ${epochReceipt.tsaWitness.witnessType}`);
  console.log(`  ✔ TSA Serial Number: ${epochReceipt.tsaWitness.serialNumber}`);
  console.log(`  ✔ TSA Timestamp: ${epochReceipt.tsaWitness.genTime}`);
  console.log(`  ✔ TSA Signature: ${epochReceipt.tsaWitness.signature.slice(0, 48)}...`);

  console.log('\n[3/3] Generating Independent Tenant Merkle Audit Paths (Inclusion Proofs):');
  for (const t of activeTenants) {
    const proof = epochReceipt.tenantInclusionProofs[t.tenantId];
    console.log(`  ✔ Tenant [${t.tenantId}]: Audit Proof Steps = ${proof.length} hashes`);
    console.log(`    Path: [${proof.map((h) => h.slice(0, 12) + '...').join(' -> ')}]`);
  }
  console.log(`  🔒 Epoch Seal Digest: ${epochReceipt.epochSealDigest}`);

  console.log('\n========================================================================');
  console.log(' 🎉 RFC 3161 TSA EPOCH SEALING SIMULATION COMPLETED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Epoch witness simulation failed:', err);
  process.exit(1);
});
