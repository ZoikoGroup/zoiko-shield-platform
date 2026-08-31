import {
  CosignBinaryAttestorService,
  ArtifactDigestMetadata,
} from './cosign-binary-attestor.service';

describe('CosignBinaryAttestorService (LAB 17/18 Supply Chain & Binary Authorization)', () => {
  let attestorService: CosignBinaryAttestorService;

  const validMetadata: ArtifactDigestMetadata = {
    imageRepository:
      'europe-west3-docker.pkg.dev/zoiko-prod/runtime/shield-core',
    imageDigest:
      'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    buildId: 'build-gcp-2026-08-31-001',
    sourceCommitHash: 'd8a7c2e1f4b3a9876543210fedcba9876543210f',
    builtAt: '2026-08-31T08:00:00.000Z',
    cosignKmsKeyUri:
      'gcp-kms://projects/zoiko-security/locations/europe-west3/keyRings/kr1/cryptoKeys/cosign-root',
  };

  beforeEach(() => {
    attestorService = new CosignBinaryAttestorService();
  });

  it('should sign artifact and grant Binary Authorization admission for valid SLSA Level 3 image', () => {
    const signRes = attestorService.signArtifactDigest(validMetadata);
    expect(signRes.signature).toBeDefined();

    const admission = attestorService.evaluateAdmissionPolicy(
      validMetadata,
      signRes.signature,
      true,
    );
    expect(admission.isAdmissionGranted).toBe(true);
    expect(admission.slsaProvenanceLevel).toBe('SLSA_LEVEL_3');
    expect(admission.verifiedSigner).toBe(validMetadata.cosignKmsKeyUri);
  });

  it('should deny admission when signature is invalid or unsigned', () => {
    const invalidSignature = 'invalid-fake-signature-hash';
    const admission = attestorService.evaluateAdmissionPolicy(
      validMetadata,
      invalidSignature,
      true,
    );
    expect(admission.isAdmissionGranted).toBe(false);
    expect(admission.slsaProvenanceLevel).toBe('UNVERIFIED');
  });

  it('should deny admission when KMS signer is untrusted', () => {
    const signRes = attestorService.signArtifactDigest(validMetadata);
    const admission = attestorService.evaluateAdmissionPolicy(
      validMetadata,
      signRes.signature,
      false,
    );
    expect(admission.isAdmissionGranted).toBe(false);
  });
});
