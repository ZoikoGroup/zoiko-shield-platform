import {
  BatchMerkleCheckpointerService,
  EvidenceLeaf,
} from '../../../shield-anchor/src/merkle/batch-merkle-checkpointer.service';
import { PqcDualSignerService } from '../../../shield-anchor/src/signing/pqc-dual-signer.service';

describe('Checkpoint 9 - Ledger Tamper-Evidence Integration Suite (§08)', () => {
  let checkpointer: BatchMerkleCheckpointerService;
  let pqcSigner: PqcDualSignerService;

  const testLeaves: EvidenceLeaf[] = [
    {
      evidenceId: 'ev-checkpoint9-01',
      tenantId: '11111111-1111-4000-8000-000000000001',
      eventType: 'AUTHENTICATION_SUCCESS',
      payloadDigest: '42e40754484f33ba20d0eb3f18a228f4a3e7b3c2918237482910384729102837',
      timestamp: '2026-09-16T12:00:00.000Z',
    },
    {
      evidenceId: 'ev-checkpoint9-02',
      tenantId: '11111111-1111-4000-8000-000000000001',
      eventType: 'IAM_PERMISSION_ELEVATION',
      payloadDigest: '8f3b198c2274ad9910c2e391b8a472c199831123984719284719283746192837',
      timestamp: '2026-09-16T12:01:00.000Z',
    },
    {
      evidenceId: 'ev-checkpoint9-03',
      tenantId: '11111111-1111-4000-8000-000000000001',
      eventType: 'EGRESS_FIREWALL_ALLOW',
      payloadDigest: 'c1852cc7cd42fc54d89a2b7190e3419088192209182736451928374619283746',
      timestamp: '2026-09-16T12:02:00.000Z',
    },
    {
      evidenceId: 'ev-checkpoint9-04',
      tenantId: '11111111-1111-4000-8000-000000000001',
      eventType: 'KMS_KEY_ROTATION',
      payloadDigest: '230859eadba14f7389ab2201994ce38171092837461928374619283746192837',
      timestamp: '2026-09-16T12:03:00.000Z',
    },
  ];

  beforeEach(() => {
    pqcSigner = new PqcDualSignerService();
    checkpointer = new BatchMerkleCheckpointerService(pqcSigner);
  });

  describe('1. Batch Sealing & Merkle Root Determinism', () => {
    it('should compute deterministic Merkle roots for identical leaf sequences', () => {
      const checkpoint1 = checkpointer.buildEpochCheckpoint(testLeaves);
      const checkpoint2 = checkpointer.buildEpochCheckpoint(testLeaves);

      expect(checkpoint1.merkleRoot).toBe(checkpoint2.merkleRoot);
      expect(checkpoint1.leafCount).toBe(4);
      expect(checkpoint1.witnessSignature).toBeDefined();
    });

    it('should generate valid dual signatures using ML-DSA-65 and ECDSA P-256', async () => {
      const checkpoint = await checkpointer.buildEpochCheckpointAsync(testLeaves);
      expect(checkpoint.pqcAlgorithm).toBe('HYBRID_ECDSA_P256_ML_DSA_65');
      expect(checkpoint.pqcSignatureHex).toBeDefined();
      expect(checkpoint.classicalSignatureHex).toBeDefined();
      expect(checkpoint.hybridSignatureContainer).toBeDefined();

      const hybridSig = await pqcSigner.signHybrid(checkpoint.merkleRoot);
      const verification = pqcSigner.verifyHybrid(checkpoint.merkleRoot, hybridSig);

      expect(verification.isValid).toBe(true);
      expect(verification.pqcValid).toBe(true);
      expect(verification.classicalValid).toBe(true);
      expect(verification.tamperDetected).toBe(false);
    });
  });

  describe('2. Inclusion Proof Generation and Cryptographic Integrity', () => {
    it('should verify valid inclusion proofs for every leaf node in the batch', () => {
      const checkpoint = checkpointer.buildEpochCheckpoint(testLeaves);

      for (let i = 0; i < testLeaves.length; i++) {
        const proof = checkpointer.generateInclusionProof(checkpoint.epochNumber, i);
        expect(proof.leafIndex).toBe(i);
        expect(proof.merkleRoot).toBe(checkpoint.merkleRoot);

        const isValid = checkpointer.verifyInclusionProof(proof);
        expect(isValid).toBe(true);
      }
    });
  });

  describe('3. Tamper-Evidence Negative Proving', () => {
    it('should FAIL proof verification if a single character of payload digest is altered', () => {
      const checkpoint = checkpointer.buildEpochCheckpoint(testLeaves);
      const proof = checkpointer.generateInclusionProof(checkpoint.epochNumber, 0);

      // Mutate 1 character in the leaf hash (tampered evidence payload)
      const tamperedProof = {
        ...proof,
        leafHash: proof.leafHash.slice(0, -1) + (proof.leafHash.endsWith('0') ? '1' : '0'),
      };

      const isValid = checkpointer.verifyInclusionProof(tamperedProof);
      expect(isValid).toBe(false);
    });

    it('should FAIL proof verification if audit path sibling hashes are tampered', () => {
      const checkpoint = checkpointer.buildEpochCheckpoint(testLeaves);
      const proof = checkpointer.generateInclusionProof(checkpoint.epochNumber, 0);

      const tamperedAuditPath = proof.auditPath.map((step, idx) =>
        idx === 0
          ? { ...step, hash: '0000000000000000000000000000000000000000000000000000000000000000' }
          : step
      );

      const tamperedProof = {
        ...proof,
        auditPath: tamperedAuditPath,
      };

      const isValid = checkpointer.verifyInclusionProof(tamperedProof);
      expect(isValid).toBe(false);
    });

    it('should FAIL proof verification if verified against a mismatched Merkle root', () => {
      const checkpoint = checkpointer.buildEpochCheckpoint(testLeaves);
      const proof = checkpointer.generateInclusionProof(checkpoint.epochNumber, 0);

      const tamperedProof = {
        ...proof,
        merkleRoot: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      };

      const isValid = checkpointer.verifyInclusionProof(tamperedProof);
      expect(isValid).toBe(false);
    });
  });
});
