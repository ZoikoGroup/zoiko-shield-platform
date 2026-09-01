import {
  SbomDriftVerifierService,
  MerkleLedgerAttestationRecord,
} from './sbom-drift-verifier.service';

describe('SbomDriftVerifierService (LAB 17 & 18 In-Cluster SBOM & Attestation Drift)', () => {
  let driftService: SbomDriftVerifierService;

  const validDigest =
    'sha256:4a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b';
  const validRecord: MerkleLedgerAttestationRecord = {
    imageDigest: validDigest,
    expectedSbomPackagesCount: 142,
    anchoredMerkleRoot: 'root-merkle-epoch-42-attested',
    epochNumber: 42,
    cosignKmsKey:
      'gcp-kms://projects/security/locations/eu/keyRings/kr1/cryptoKeys/cosign-root',
  };

  beforeEach(() => {
    driftService = new SbomDriftVerifierService();
    driftService.registerAttestedRelease(validRecord);
  });

  it('should confirm ZERO DRIFT for legitimate attested container pod', () => {
    const res = driftService.evaluatePodIntegrity({
      podName: 'shield-core-7b8f9c-1234',
      namespace: 'zoikoshield-prod',
      cluster: 'gke-europe-west3-prod-01',
      observedImageDigest: validDigest,
      runningSbomPackagesCount: 142,
    });

    expect(res.isDriftDetected).toBe(false);
    expect(res.driftClassification).toBe('ZERO_DRIFT_VALID_ATTESTATION');
    expect(res.remediationAction).toBe('NONE');
  });

  it('should detect UNAUTHORIZED_IMAGE_ALTERATION for un-anchored pod image', () => {
    const res = driftService.evaluatePodIntegrity({
      podName: 'rogue-worker-9988',
      namespace: 'zoikoshield-prod',
      cluster: 'gke-europe-west3-prod-01',
      observedImageDigest: 'sha256:unknown-unregistered-image-digest-tampered',
      runningSbomPackagesCount: 142,
    });

    expect(res.isDriftDetected).toBe(true);
    expect(res.driftClassification).toBe('UNAUTHORIZED_IMAGE_ALTERATION');
    expect(res.remediationAction).toBe('EVICT_POD_AND_TRIGGER_CONTAINMENT');
  });

  it('should detect PACKAGE_COUNT_MISMATCH if in-cluster dependencies altered', () => {
    const res = driftService.evaluatePodIntegrity({
      podName: 'shield-core-7b8f9c-1234',
      namespace: 'zoikoshield-prod',
      cluster: 'gke-europe-west3-prod-01',
      observedImageDigest: validDigest,
      runningSbomPackagesCount: 145, // Injected extra package
    });

    expect(res.isDriftDetected).toBe(true);
    expect(res.driftClassification).toBe('PACKAGE_COUNT_MISMATCH');
    expect(res.remediationAction).toBe('ALERT_SOC_LEAD');
  });
});
