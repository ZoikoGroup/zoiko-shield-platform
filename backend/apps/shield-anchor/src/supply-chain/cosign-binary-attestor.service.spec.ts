import * as crypto from 'crypto';

// See apps/shield-action/src/command-signing/cloud-hsm-signer.service.spec.ts
// for why GcpKmsSigner is mocked directly rather than the @google-cloud/kms
// transport: its own cryptographic correctness is that class's concern; this
// spec proves CosignBinaryAttestorService delegates to it correctly and that
// a tampered payload fails REAL verification, not a hash re-comparison.
const signedMessages = new Map<string, string>();
const fakeSign = jest.fn(async (message: string) => {
  const sig = crypto
    .createHmac('sha256', 'test-kms-key-material')
    .update(message)
    .digest('hex');
  signedMessages.set(sig, message);
  return sig;
});
const fakeVerify = jest.fn(async (message: string, signatureHex: string) => {
  return signedMessages.get(signatureHex) === message;
});

jest.mock('../../../../libs/kms/src/gcp-kms-signer', () => ({
  GcpKmsSigner: jest.fn().mockImplementation((keyVersionName: string) => ({
    keyId: keyVersionName,
    algorithm: 'EC_SIGN_P256_SHA256',
    sign: fakeSign,
    verify: fakeVerify,
    publicKey: jest.fn(
      async () => '-----BEGIN PUBLIC KEY-----\nfake\n-----END PUBLIC KEY-----',
    ),
  })),
}));

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
    signedMessages.clear();
    jest.clearAllMocks();
  });

  it('resolves the crypto-key URI to a KMS key version resource name', async () => {
    const { GcpKmsSigner } = require('../../../../libs/kms/src/gcp-kms-signer');
    await attestorService.signArtifactDigest(validMetadata);
    expect(GcpKmsSigner).toHaveBeenCalledWith(
      'projects/zoiko-security/locations/europe-west3/keyRings/kr1/cryptoKeys/cosign-root/cryptoKeyVersions/1',
    );
  });

  it('should sign artifact and grant Binary Authorization admission for valid SLSA Level 3 image', async () => {
    const signRes = await attestorService.signArtifactDigest(validMetadata);
    expect(signRes.signature).toBeDefined();

    const admission = await attestorService.evaluateAdmissionPolicy(
      validMetadata,
      signRes.signature,
      true,
    );
    expect(admission.isAdmissionGranted).toBe(true);
    expect(admission.slsaProvenanceLevel).toBe('SLSA_LEVEL_3');
    expect(admission.verifiedSigner).toBe(validMetadata.cosignKmsKeyUri);
  });

  it('should deny admission when signature is invalid or unsigned', async () => {
    const invalidSignature = 'invalid-fake-signature-hash';
    const admission = await attestorService.evaluateAdmissionPolicy(
      validMetadata,
      invalidSignature,
      true,
    );
    expect(admission.isAdmissionGranted).toBe(false);
    expect(admission.slsaProvenanceLevel).toBe('UNVERIFIED');
  });

  it('should deny admission when KMS signer is untrusted', async () => {
    const signRes = await attestorService.signArtifactDigest(validMetadata);
    const admission = await attestorService.evaluateAdmissionPolicy(
      validMetadata,
      signRes.signature,
      false,
    );
    expect(admission.isAdmissionGranted).toBe(false);
  });

  it('should deny admission when the signed payload is tampered with after signing (real signature check, not a hash re-comparison)', async () => {
    const signRes = await attestorService.signArtifactDigest(validMetadata);

    const tamperedMetadata: ArtifactDigestMetadata = {
      ...validMetadata,
      sourceCommitHash: 'ffffffffffffffffffffffffffffffffffffffff',
    };

    const admission = await attestorService.evaluateAdmissionPolicy(
      tamperedMetadata,
      signRes.signature,
      true,
    );
    expect(admission.isAdmissionGranted).toBe(false);
    expect(admission.slsaProvenanceLevel).toBe('UNVERIFIED');
  });
});
