/**
 * Continuous In-Cluster SBOM & Attestation Drift Verifier Simulator
 * 
 * Simulates:
 * 1. Anchoring verified container release image digests & SBOM manifests into the immutable Merkle transparency ledger.
 * 2. Evaluating in-cluster running pod integrity and confirming zero-drift compliance.
 * 3. Detecting unauthorized container tampering / un-anchored rogue pods and triggering containment eviction.
 */

import 'dotenv/config';
import 'reflect-metadata';
import * as crypto from 'crypto';
import {
  SbomDriftVerifierService,
  RunningPodImageState,
  MerkleLedgerAttestationRecord,
} from '../apps/shield-anchor/src/supply-chain/sbom-drift-verifier.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield In-Cluster SBOM & Attestation Drift Verifier Simulator');
  console.log('    Specification: Backend Build Guide §LAB 17 & §LAB 18 (Cluster Integrity)');
  console.log('========================================================================\n');

  const driftService = new SbomDriftVerifierService();

  const releaseDigest = `sha256:${crypto.randomBytes(32).toString('hex')}`;
  const releaseRecord: MerkleLedgerAttestationRecord = {
    imageDigest: releaseDigest,
    expectedSbomPackagesCount: 156,
    anchoredMerkleRoot: `root-${crypto.randomBytes(32).toString('hex')}`,
    epochNumber: 99,
    cosignKmsKey: 'gcp-kms://projects/zoiko-prod/locations/europe-west3/keyRings/kr1/cryptoKeys/cosign-root',
  };

  console.log('[1/3] Anchoring Verified Release Digest into Merkle Transparency Ledger...');
  driftService.registerAttestedRelease(releaseRecord);
  console.log(`  ✔ Release Image: ${releaseRecord.imageDigest}`);
  console.log(`  ✔ Expected SBOM Packages: ${releaseRecord.expectedSbomPackagesCount}`);
  console.log(`  ✔ Anchored Merkle Root: ${releaseRecord.anchoredMerkleRoot}`);

  console.log('\n[2/3] Evaluating Running Kubernetes Pod Integrity (Legitimate Pod)...');
  const validPod: RunningPodImageState = {
    podName: 'shield-core-deployment-7f89c-01',
    namespace: 'zoikoshield-production',
    cluster: 'gke-europe-west3-prod-primary',
    observedImageDigest: releaseDigest,
    runningSbomPackagesCount: 156,
  };

  const validRes = driftService.evaluatePodIntegrity(validPod);
  console.log(`  ✔ Scan ID: ${validRes.scanId}`);
  console.log(`  ✔ Drift Detected: ${validRes.isDriftDetected}`);
  console.log(`  ✔ Classification: ${validRes.driftClassification}`);
  console.log(`  ✔ Remediation: ${validRes.remediationAction}`);

  console.log('\n[3/3] Simulating Rogue/Tampered Pod Running in Production Cluster...');
  const tamperedPod: RunningPodImageState = {
    podName: 'rogue-miner-injected-99a',
    namespace: 'zoikoshield-production',
    cluster: 'gke-europe-west3-prod-primary',
    observedImageDigest: `sha256:${crypto.randomBytes(32).toString('hex')}`, // Unregistered
    runningSbomPackagesCount: 210,
  };

  const rogueRes = driftService.evaluatePodIntegrity(tamperedPod);
  console.log(`  🚨 Drift Detected: ${rogueRes.isDriftDetected}`);
  console.log(`  🚨 Classification: ${rogueRes.driftClassification}`);
  console.log(`  🚨 Automated Remediation: ${rogueRes.remediationAction}`);
  console.log(`  🔒 Attestation Digest: ${rogueRes.attestationDigest}`);

  console.log('\n========================================================================');
  console.log(' 🎉 IN-CLUSTER SBOM & DRIFT VERIFIER SIMULATION COMPLETED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ SBOM drift simulation failed:', err);
  process.exit(1);
});
