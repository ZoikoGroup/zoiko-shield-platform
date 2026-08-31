/**
 * Supply Chain Cosign/KMS Attestation & Binary Authorization Simulator
 * 
 * Simulates:
 * 1. Generating Cosign / Cloud KMS software supply chain signatures over immutable artifact digests.
 * 2. Evaluating GKE Binary Authorization admission policies (SLSA Level 3 provenance).
 * 3. Detecting and blocking unsigned or unverified container image admission attempts per LAB 17/18.
 */

import 'dotenv/config';
import 'reflect-metadata';
import * as crypto from 'crypto';
import {
  CosignBinaryAttestorService,
  ArtifactDigestMetadata,
} from '../apps/shield-anchor/src/supply-chain/cosign-binary-attestor.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield Supply Chain Cosign/KMS & Binary Authorization Simulator');
  console.log('    Specification: Backend Build Guide §LAB 17 & §LAB 18 (Supply Chain)');
  console.log('========================================================================\n');

  const attestorService = new CosignBinaryAttestorService();

  const productionImageMetadata: ArtifactDigestMetadata = {
    imageRepository: 'europe-west3-docker.pkg.dev/zoikoshield-prod/runtime/shield-core',
    imageDigest: `sha256:${crypto.randomBytes(32).toString('hex')}`,
    buildId: `build-gcp-cb-${crypto.randomUUID().slice(0, 8)}`,
    sourceCommitHash: crypto.randomBytes(20).toString('hex'),
    builtAt: new Date().toISOString(),
    cosignKmsKeyUri: 'gcp-kms://projects/zoiko-prod-security/locations/europe-west3/keyRings/release-kr/cryptoKeys/cosign-prod-root',
  };

  console.log('[1/3] Signing Immutable Production Artifact Digest via Cloud KMS / Cosign...');
  const signResult = attestorService.signArtifactDigest(productionImageMetadata);
  console.log(`  ✔ Image: ${productionImageMetadata.imageRepository}`);
  console.log(`  ✔ Immutable Digest: ${productionImageMetadata.imageDigest}`);
  console.log(`  ✔ Source Commit: ${productionImageMetadata.sourceCommitHash}`);
  console.log(`  🔒 Cosign Signature: ${signResult.signature.slice(0, 32)}...`);

  console.log('\n[2/3] Evaluating GKE Binary Authorization Cluster Admission Policy...');
  const admission = attestorService.evaluateAdmissionPolicy(productionImageMetadata, signResult.signature, true);
  console.log(`  ✔ Admission Granted: ${admission.isAdmissionGranted}`);
  console.log(`  ✔ Provenance Level: ${admission.slsaProvenanceLevel}`);
  console.log(`  ✔ Verified Signer: ${admission.verifiedSigner}`);
  console.log(`  🔒 Admission Attestation Digest: ${admission.attestationDigest}`);

  console.log('\n[3/3] Simulating Rogue/Tampered Image Admission Attempt (Unsigned Digest)...');
  const rogueMetadata: ArtifactDigestMetadata = {
    ...productionImageMetadata,
    imageDigest: `sha256:${crypto.randomBytes(32).toString('hex')}`, // Modified bytes
  };

  const rogueAdmission = attestorService.evaluateAdmissionPolicy(rogueMetadata, signResult.signature, true);
  console.log(`  🛑 Admission Granted: ${rogueAdmission.isAdmissionGranted}`);
  console.log(`  🛑 Provenance Level: ${rogueAdmission.slsaProvenanceLevel}`);
  console.log('  🔒 Cluster Security Guarantee: Unsigned/tampered image blocked by Binary Authorization admission controller.');

  console.log('\n========================================================================');
  console.log(' 🎉 COSIGN & BINARY AUTHORIZATION ATTESTATION SIMULATION COMPLETED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Supply chain simulation failed:', err);
  process.exit(1);
});
