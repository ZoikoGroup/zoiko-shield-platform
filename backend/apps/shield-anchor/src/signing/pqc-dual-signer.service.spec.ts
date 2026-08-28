import { PqcDualSignerService } from './pqc-dual-signer.service';

describe('PqcDualSignerService', () => {
  let pqcSigner: PqcDualSignerService;

  beforeEach(() => {
    pqcSigner = new PqcDualSignerService();
  });

  it('should generate a valid hybrid classical + post-quantum dual signature container', async () => {
    const epochMerkleRoot = '12d464dee4f94e6b6ba280e7753cf9e80b44c409b0576f33f83467fe048410b3';
    const sigResult = await pqcSigner.signHybrid(epochMerkleRoot);

    expect(sigResult.signatureId).toBeDefined();
    expect(sigResult.algorithmSuite).toBe('HYBRID_ECDSA_P256_ML_DSA_65');
    expect(sigResult.classicalSignatureHex).toBeDefined();
    expect(sigResult.pqcSignatureHex).toBeDefined();
    expect(sigResult.hybridCombinedSignatureBase64).toBeDefined();
    expect(sigResult.classicalPublicKeyPem).toContain('BEGIN PUBLIC KEY');
    expect(sigResult.pqcPublicKeyBase64).toBeDefined();
  });

  it('should verify genuine hybrid dual signatures as valid', async () => {
    const payload = 'EVIDENCE_BLOCK_CANONICAL_HASH_12345';
    const sigResult = await pqcSigner.signHybrid(payload);
    const verification = pqcSigner.verifyHybrid(payload, sigResult);

    expect(verification.isValid).toBe(true);
    expect(verification.classicalValid).toBe(true);
    expect(verification.pqcValid).toBe(true);
    expect(verification.tamperDetected).toBe(false);
  });

  it('should detect tampering when payload is modified after signing', async () => {
    const payload = 'ORIGINAL_AUDIT_LOG_ENTRY';
    const sigResult = await pqcSigner.signHybrid(payload);
    const tamperedPayload = 'TAMPERED_AUDIT_LOG_ENTRY';

    const verification = pqcSigner.verifyHybrid(tamperedPayload, sigResult);

    expect(verification.isValid).toBe(false);
    expect(verification.tamperDetected).toBe(true);
  });
});
