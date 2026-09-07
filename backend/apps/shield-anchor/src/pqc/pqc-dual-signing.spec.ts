import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';
import { PqcDualSignerService, HybridDualSignatureResult } from '../signing/pqc-dual-signer.service';

describe('PqcDualSignerService (LAB 11 Post-Quantum Cryptography & FIPS 204 Dual-Signing)', () => {
  let pqcSignerService: PqcDualSignerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PqcDualSignerService],
    }).compile();

    pqcSignerService = module.get<PqcDualSignerService>(PqcDualSignerService);
  });

  it('should generate a valid hybrid dual-signature container (ECDSA P-256 + ML-DSA-65)', async () => {
    const epochMerkleRoot = crypto.createHash('sha256').update('MERKLE_ROOT_EPOCH_2026_PROD').digest('hex');
    const signature = await pqcSignerService.signHybrid(epochMerkleRoot);

    expect(signature.signatureId).toBeDefined();
    expect(signature.algorithmSuite).toBe('HYBRID_ECDSA_P256_ML_DSA_65');
    expect(signature.classicalSignatureHex).toBeDefined();
    expect(signature.pqcSignatureHex).toBeDefined();
    expect(signature.classicalPublicKeyPem).toContain('BEGIN PUBLIC KEY');
    expect(signature.pqcPublicKeyBase64).toBeDefined();
    expect(signature.hybridCombinedSignatureBase64).toBeDefined();
  });

  it('should verify genuine hybrid signature with both classical and PQC signatures valid', async () => {
    const epochMerkleRoot = crypto.createHash('sha256').update('MERKLE_ROOT_GENUINE_EVIDENCE').digest('hex');
    const signature = await pqcSignerService.signHybrid(epochMerkleRoot);

    const verification = pqcSignerService.verifyHybrid(epochMerkleRoot, signature);

    expect(verification.isValid).toBe(true);
    expect(verification.classicalValid).toBe(true);
    expect(verification.pqcValid).toBe(true);
    expect(verification.tamperDetected).toBe(false);
  });

  it('should reject signature when payload data has been tampered with', async () => {
    const originalRoot = crypto.createHash('sha256').update('GENUINE_LEDGER_ROOT').digest('hex');
    const signature = await pqcSignerService.signHybrid(originalRoot);

    const tamperedRoot = crypto.createHash('sha256').update('TAMPERED_LEDGER_ROOT_ATTACK').digest('hex');
    const verification = pqcSignerService.verifyHybrid(tamperedRoot, signature);

    expect(verification.isValid).toBe(false);
    expect(verification.classicalValid).toBe(false);
    expect(verification.pqcValid).toBe(false);
    expect(verification.tamperDetected).toBe(true);
  });

  it('should reject and flag tamper if classical signature is corrupted', async () => {
    const epochMerkleRoot = crypto.createHash('sha256').update('MERKLE_ROOT_CORRUPT_CLASSICAL').digest('hex');
    const signature = await pqcSignerService.signHybrid(epochMerkleRoot);

    const corruptedSignature: HybridDualSignatureResult = {
      ...signature,
      classicalSignatureHex: 'deadbeef' + signature.classicalSignatureHex.slice(8),
    };

    const verification = pqcSignerService.verifyHybrid(epochMerkleRoot, corruptedSignature);

    expect(verification.isValid).toBe(false);
    expect(verification.classicalValid).toBe(false);
    expect(verification.pqcValid).toBe(true);
    expect(verification.tamperDetected).toBe(true);
  });

  it('should reject and flag tamper if PQC ML-DSA-65 signature is corrupted', async () => {
    const epochMerkleRoot = crypto.createHash('sha256').update('MERKLE_ROOT_CORRUPT_PQC').digest('hex');
    const signature = await pqcSignerService.signHybrid(epochMerkleRoot);

    const corruptedSignature: HybridDualSignatureResult = {
      ...signature,
      pqcSignatureHex: 'cafebabe' + signature.pqcSignatureHex.slice(8),
    };

    const verification = pqcSignerService.verifyHybrid(epochMerkleRoot, corruptedSignature);

    expect(verification.isValid).toBe(false);
    expect(verification.classicalValid).toBe(true);
    expect(verification.pqcValid).toBe(false);
    expect(verification.tamperDetected).toBe(true);
  });
});
