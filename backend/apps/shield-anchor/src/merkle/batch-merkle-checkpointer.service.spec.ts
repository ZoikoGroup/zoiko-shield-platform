import {
  BatchMerkleCheckpointerService,
  EvidenceLeaf,
} from './batch-merkle-checkpointer.service';

describe('BatchMerkleCheckpointerService (High-Throughput Evidence Anchoring)', () => {
  let checkpointer: BatchMerkleCheckpointerService;

  beforeEach(() => {
    checkpointer = new BatchMerkleCheckpointerService();
  });

  it('1. should seal an epoch Merkle tree checkpoint with witness signature', () => {
    const items: EvidenceLeaf[] = [
      {
        evidenceId: 'evi-01',
        tenantId: 'tenant-acme',
        eventType: 'LOGIN_FAILURE',
        payloadDigest: 'sha256:abcd1234',
        timestamp: new Date().toISOString(),
      },
      {
        evidenceId: 'evi-02',
        tenantId: 'tenant-acme',
        eventType: 'IAM_KEY_ROTATED',
        payloadDigest: 'sha256:ef567890',
        timestamp: new Date().toISOString(),
      },
      {
        evidenceId: 'evi-03',
        tenantId: 'tenant-acme',
        eventType: 'EDR_ISOLATE',
        payloadDigest: 'sha256:11223344',
        timestamp: new Date().toISOString(),
      },
      {
        evidenceId: 'evi-04',
        tenantId: 'tenant-acme',
        eventType: 'SBOM_ATTESTED',
        payloadDigest: 'sha256:55667788',
        timestamp: new Date().toISOString(),
      },
    ];

    const checkpoint = checkpointer.buildEpochCheckpoint(items);

    expect(checkpoint.epochNumber).toBe(1);
    expect(checkpoint.leafCount).toBe(4);
    expect(checkpoint.merkleRoot).toBeDefined();
    expect(checkpoint.witnessSignature).toBeDefined();
  });

  it('2. should generate and independently verify cryptographic inclusion proofs', () => {
    const items: EvidenceLeaf[] = Array.from({ length: 8 }).map((_, i) => ({
      evidenceId: `evi-${i}`,
      tenantId: 'tenant-acme',
      eventType: 'SECURITY_EVENT',
      payloadDigest: `sha256:digest-${i}`,
      timestamp: new Date().toISOString(),
    }));

    const checkpoint = checkpointer.buildEpochCheckpoint(items);

    // Verify inclusion proof for leaf index 3
    const proof = checkpointer.generateInclusionProof(
      checkpoint.epochNumber,
      3,
    );
    expect(proof.leafIndex).toBe(3);
    expect(proof.auditPath.length).toBe(3); // log2(8) = 3
    expect(proof.merkleRoot).toBe(checkpoint.merkleRoot);

    const isValid = checkpointer.verifyInclusionProof(proof);
    expect(isValid).toBe(true);
  });

  it('3. should reject tampered inclusion proofs', () => {
    const items: EvidenceLeaf[] = Array.from({ length: 4 }).map((_, i) => ({
      evidenceId: `evi-${i}`,
      tenantId: 'tenant-acme',
      eventType: 'SECURITY_EVENT',
      payloadDigest: `sha256:digest-${i}`,
      timestamp: new Date().toISOString(),
    }));

    const checkpoint = checkpointer.buildEpochCheckpoint(items);
    const proof = checkpointer.generateInclusionProof(
      checkpoint.epochNumber,
      1,
    );

    // Tamper with the leaf hash
    proof.leafHash = 'tampered-leaf-hash-00000000000000000000000000000000';

    const isValid = checkpointer.verifyInclusionProof(proof);
    expect(isValid).toBe(false);
  });

  it('4. should asynchronously seal epoch with PQC FIPS 204 ML-DSA-65 & ECDSA P-256 hybrid signature', async () => {
    const mockPqcSigner = {
      signHybrid: jest.fn().mockResolvedValue({
        signatureId: 'sig-pqc-test',
        algorithmSuite: 'HYBRID_ECDSA_P256_ML_DSA_65',
        keyId: 'pqc-hsm-01',
        classicalSignatureHex: 'deadbeefclassical',
        pqcSignatureHex: 'cafebabepqc',
        hybridCombinedSignatureBase64: 'ZXhhbXBsZWh5YnJpZA==',
        classicalPublicKeyPem: '-----BEGIN PUBLIC KEY-----...',
        pqcPublicKeyBase64: 'pqcpubkey...',
        signedAt: new Date().toISOString(),
      }),
    };

    const pqcCheckpointer = new BatchMerkleCheckpointerService(
      mockPqcSigner as any,
    );

    const items: EvidenceLeaf[] = [
      {
        evidenceId: 'evi-pqc-1',
        tenantId: 'tenant-quantum',
        eventType: 'CONFIDENTIAL_COMPUTE_EXECUTION',
        payloadDigest: 'sha256:99887766',
        timestamp: new Date().toISOString(),
      },
    ];

    const checkpoint = await pqcCheckpointer.buildEpochCheckpointAsync(items);

    expect(checkpoint.epochNumber).toBe(1);
    expect(checkpoint.pqcAlgorithm).toBe('HYBRID_ECDSA_P256_ML_DSA_65');
    expect(checkpoint.pqcSignatureHex).toBe('cafebabepqc');
    expect(checkpoint.classicalSignatureHex).toBe('deadbeefclassical');
    expect(checkpoint.hybridSignatureContainer).toBe('ZXhhbXBsZWh5YnJpZA==');
    expect(mockPqcSigner.signHybrid).toHaveBeenCalledWith(
      checkpoint.merkleRoot,
    );
  });
});
