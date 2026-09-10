/**
 * End-to-End Compliance Audit Package Generator & Offline Verifier Simulation
 * 
 * Demonstrates:
 * 1. Building a multi-framework cryptographic audit bundle (SOC 2, ISO 27001, DORA).
 * 2. Sealing the bundle with domain-separated ZS-MERKLE-V1 Merkle Tree.
 * 3. Offline independent verification via verifier-cli (Zero platform/network dependency).
 * 4. Tamper detection verification (deliberate byte mutation assertion).
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { resolve, join } from 'path';
import * as crypto from 'crypto';
import { StandaloneMerkleVerifier } from '../apps/verifier-cli/src/merkle/standalone-merkle-verifier';
import { runVerifier } from '../apps/verifier-cli/src/main';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield Offline Audit Package Generator & Verifier Runner');
  console.log('    Specification: ZS-T0-AUD-001 / TUT-05 (Zero-Dependency Verification)');
  console.log('========================================================================\n');

  const tenantId = `tenant-bank-${crypto.randomUUID().slice(0, 8)}`;
  const environmentId = 'production';
  const packageId = `pkg-aud-${crypto.randomUUID()}`;
  const outDir = resolve(__dirname, '../dist/audit-packages/demo-audit-package');

  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true, force: true });
  }
  mkdirSync(join(outDir, 'evidence'), { recursive: true });
  mkdirSync(join(outDir, 'proofs'), { recursive: true });

  console.log(`[1/4] Generating Canonical Evidence Items for Tenant: ${tenantId}...`);

  // Evidence Item 1: SOC 2 Access Control
  const soc2Evidence = {
    controlId: 'SOC2-CC6.1',
    framework: 'SOC 2 Type II',
    tenantId,
    timestamp: new Date().toISOString(),
    mfaEnforcedRate: 1.0,
    activePrivilegedAccounts: 3,
    status: 'COMPLIANT',
  };
  const soc2ContentHash = crypto.createHash('sha256').update(JSON.stringify(soc2Evidence)).digest('hex');
  writeFileSync(join(outDir, 'evidence', 'soc2_access.json'), JSON.stringify(soc2Evidence, null, 2), 'utf8');

  // Evidence Item 2: ISO 27001:2022 Cryptography & PQC
  const isoEvidence = {
    controlId: 'ISO27001-A.8.24',
    framework: 'ISO/IEC 27001:2022',
    tenantId,
    timestamp: new Date().toISOString(),
    kmsKeyRotationDays: 30,
    pqcDualSignEnforced: true,
    algorithms: ['ML-DSA-65 (Dilithium3)', 'Ed25519'],
    status: 'COMPLIANT',
  };
  const isoContentHash = crypto.createHash('sha256').update(JSON.stringify(isoEvidence)).digest('hex');
  writeFileSync(join(outDir, 'evidence', 'iso_cryptography.json'), JSON.stringify(isoEvidence, null, 2), 'utf8');

  // Evidence Item 3: ISO 27001:2022 Monitoring Activities & Log Integrity
  const isoLogEvidence = {
    controlId: 'ISO27001-A.8.16',
    framework: 'ISO/IEC 27001:2022',
    tenantId,
    timestamp: new Date().toISOString(),
    merkleLogAnchoringEnforced: true,
    unresolvedHighSeverityThreats: 0,
    status: 'COMPLIANT',
  };
  const isoLogContentHash = crypto.createHash('sha256').update(JSON.stringify(isoLogEvidence)).digest('hex');
  writeFileSync(join(outDir, 'evidence', 'iso_log_integrity.json'), JSON.stringify(isoLogEvidence, null, 2), 'utf8');

  // Evidence Item 4: DORA Operational Resilience (ADR-08: Phase 2 Deferred Overlay)
  const doraEvidence = {
    controlId: 'DORA-ART9',
    framework: 'DORA (EU Regulation 2022/2554 [derived])',
    tenantId,
    timestamp: new Date().toISOString(),
    disasterRecoveryRtoMinutes: 12,
    multiRegionActiveActive: true,
    status: 'COMPLIANT',
  };
  const doraContentHash = crypto.createHash('sha256').update(JSON.stringify(doraEvidence)).digest('hex');
  writeFileSync(join(outDir, 'evidence', 'dora_resilience.json'), JSON.stringify(doraEvidence, null, 2), 'utf8');

  // Build Evidence Index
  const entries = [
    { type: 'soc2_access', contentHash: soc2ContentHash, entryHash: crypto.createHash('sha256').update(`soc2_access:${soc2ContentHash}`).digest('hex') },
    { type: 'iso_cryptography', contentHash: isoContentHash, entryHash: crypto.createHash('sha256').update(`iso_cryptography:${isoContentHash}`).digest('hex') },
    { type: 'iso_log_integrity', contentHash: isoLogContentHash, entryHash: crypto.createHash('sha256').update(`iso_log_integrity:${isoLogContentHash}`).digest('hex') },
    { type: 'dora_resilience', contentHash: doraContentHash, entryHash: crypto.createHash('sha256').update(`dora_resilience:${doraContentHash}`).digest('hex') },
  ];

  const indexLines = entries.map((e) => JSON.stringify(e)).join('\n');
  writeFileSync(join(outDir, 'evidence_index.jsonl'), indexLines, 'utf8');

  console.log(`[2/4] Building ZS-MERKLE-V1 Merkle Tree over ${entries.length} Evidence Leaves...`);
  const merkleVerifier = new StandaloneMerkleVerifier();
  const tree = merkleVerifier.build(entries.map((e) => e.entryHash));

  const manifestCore = {
    packageId,
    title: 'ZoikoShield Annual Regulatory Compliance Trust Bundle',
    tenantId,
    environmentId,
    merkleRoot: tree.root,
    leavesCount: entries.length,
    generatedAt: new Date().toISOString(),
  };

  const manifestCoreHash = crypto.createHash('sha256').update(JSON.stringify(manifestCore)).digest('hex');

  const manifest = {
    packageId,
    manifestCore,
    manifestCoreHash,
    merkleRoot: tree.root,
    transparencyWitness: {
      witnessId: 'witness-cloud-hsm-01',
      signedAt: new Date().toISOString(),
      signatureProfile: 'ECDSA_P256_SHA256+ML_DSA_65',
    },
    humanApproval: {
      approvedBy: 'compliance-auditor@enterprise.com',
      role: 'LEAD_ASSURANCE_OFFICER',
      approvedAt: new Date().toISOString(),
    },
  };

  const manifestString = JSON.stringify(manifest, null, 2);
  writeFileSync(join(outDir, 'manifest.json'), manifestString, 'utf8');

  const packageEnvelopeHash = crypto.createHash('sha256').update(manifestString).digest('hex');
  writeFileSync(join(outDir, 'envelope.json'), JSON.stringify({ packageEnvelopeHash }, null, 2), 'utf8');

  console.log(`  ✔ Package Merkle Root:   ${tree.root}`);
  console.log(`  ✔ Package Envelope Hash: ${packageEnvelopeHash}`);
  console.log(`  ✔ ManifestCore Hash:     ${manifestCoreHash}`);

  console.log('\n[3/4] Executing Standalone Offline Verifier CLI on Clean Package...');
  const verifyResult = runVerifier(['verify', outDir]);

  if (verifyResult !== 0) {
    throw new Error(`Clean audit package failed offline verification with exit code: ${verifyResult}`);
  }

  const certificatePath = join(outDir, 'audit_certificate.json');
  const certificate = JSON.parse(readFileSync(certificatePath, 'utf8'));
  console.log(`  ✔ Certificate Status: ${certificate.verificationStatus}`);
  console.log(`  ✔ Certificate ID:     ${certificate.certificateId}`);

  console.log('\n[4/4] Tamper Detection Check (Simulating Malicious Byte Modification)...');
  // Tamper: alter the SOC 2 active privileged accounts from 3 to 999
  const tamperedSoc2 = { ...soc2Evidence, activePrivilegedAccounts: 999 };
  writeFileSync(join(outDir, 'evidence', 'soc2_access.json'), JSON.stringify(tamperedSoc2, null, 2), 'utf8');

  const tamperedResult = runVerifier(['verify', outDir]);
  if (tamperedResult === 0) {
    throw new Error('CRITICAL FAILURE: Tampered audit package passed verification unexpectedly!');
  }

  console.log('  ✔ Tamper correctly detected and rejected by Offline Verifier CLI (Exit Code 1)!');

  console.log('\n========================================================================');
  console.log(' 🎉 AUDIT PACKAGE GENERATION & OFFLINE VERIFICATION SUCCEEDED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Audit package simulation failed:', err);
  process.exit(1);
});
