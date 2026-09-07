import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { verifyPackageDirectory } from '../../../tools/independent-verifier/src/verify';
import { hashCanonicalJson, sha256Hex } from '../../../tools/independent-verifier/src/hashing/hash';
import { MerkleTreeService } from './merkle/merkle-tree.service';

describe('LAB 11 — Evidence Ledger & Independent Offline Verifier Round-Trip', () => {
  let tempDir: string;
  const merkleService = new MerkleTreeService();

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zs-evidence-pkg-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function createSampleVerifiedPackage(targetDir: string, tamperFn?: (pkg: any) => void) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const tenantId = 'tenant-corp-01';
    const evidence1 = { evidenceId: 'ev-001', tenantId, status: 'COMPLIANT', timestamp: '2026-09-01T10:00:00Z' };
    const rawEvidenceBytes = Buffer.from(JSON.stringify(evidence1), 'utf-8');
    const ev1Hash = sha256Hex(rawEvidenceBytes);

    const evidenceDir = path.join(targetDir, 'evidence');
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, 'ev-001.json'), rawEvidenceBytes);

    // 1. Build valid hash-chained ledger entries
    const entry1Core = {
      tenantId,
      sequence: 1,
      evidenceId: 'ev-001',
      previousEntryHash: null as string | null,
      evidenceMetadata: { collector: 'aws-audit-collector', sourceVersion: '1.0' },
    };
    const { contentHash: entry1Hash } = hashCanonicalJson({
      tenantId: entry1Core.tenantId,
      sequence: entry1Core.sequence,
      evidenceId: entry1Core.evidenceId,
      previousEntryHash: entry1Core.previousEntryHash,
      evidenceMetadata: entry1Core.evidenceMetadata,
    });
    const ledgerHeadHash = entry1Hash;

    // 2. Build Manifest Core matching ManifestCore interface
    const manifestCore = {
      tenantId,
      scope: { frameworks: ['SOC2-TYPE-2', 'ISO-27001'] },
      period: { startTime: '2026-09-01T00:00:00Z', endTime: '2026-09-07T00:00:00Z' },
      schemaBundle: { id: 'sb-v1', hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
      frameworkVersions: ['SOC2-2026'],
      mappingVersions: ['MAP-2026.08'],
      evidenceIndex: [
        {
          evidenceId: 'ev-001',
          contentHash: ev1Hash,
          integrityState: 'VERIFIED',
        },
      ],
      ledgerEntries: [
        {
          ...entry1Core,
          entryHash: entry1Hash,
        },
      ],
      evaluationIndex: [],
      assessmentIndex: [],
      riskIndex: [],
      exceptionIndex: [],
      knownGaps: [],
      limitations: [],
      verifierProfile: {
        minVerifierVersion: '1.0.0',
        verifierSourceVersion: '1.0.0',
        treeProfile: 'ZS-MERKLE-V1',
        hashAlgorithm: 'SHA-256',
        canonicalizationProfile: 'zs-canonical-json-v1',
      },
      exportMetadata: { exportedBy: 'lead-auditor-1', exportScope: 'FULL' },
    };

    const { contentHash: manifestCoreHash } = hashCanonicalJson(manifestCore);

    // 3. Merkle aggregation over leaves: [ledgerHeadHash, manifestCoreHash]
    const leaves = [ledgerHeadHash, manifestCoreHash];
    const merkleResult = merkleService.build(leaves);
    const merkleRoot = merkleResult.root;
    const proofsByLeafIndex: Record<string, any[]> = {};
    for (const [idx, p] of Object.entries(merkleResult.proofs)) {
      proofsByLeafIndex[idx] = p;
    }

    // 4. Sign Merkle root with Cloud KMS / HSM key
    const signer = crypto.createSign('SHA256');
    signer.update(merkleRoot);
    signer.end();
    const signatureDer = signer.sign(privateKey, 'hex');

    // 5. Build Proof Envelope & Witness Receipts
    const mockWitnessId = 'witness-local-dev-1';
    const mockWitnessHash = crypto
      .createHash('sha256')
      .update(`${merkleRoot}${mockWitnessId}zoiko-mock-witness-v1`)
      .digest('hex');

    const proofEnvelope = {
      checkpoint: {
        id: 'chk-1001',
        anchorSequence: 1,
        ledgerSequence: 1,
        ledgerHeadHash,
        packageId: 'pkg-audit-2026-q3',
        packageVersion: 1,
        manifestCoreHash,
        merkleRoot,
        treeProfile: 'ZS-MERKLE-V1',
        hashAlgorithm: 'SHA-256',
        canonicalizationProfile: 'zs-checkpoint-v1',
        signingKeyId: 'hsm-key-01',
        signature: signatureDer,
        witnessAssuranceState: 'TEST_ONLY',
        status: 'PUBLISHED',
      },
      merkleRoot,
      proofsByLeafIndex,
      signature: signatureDer,
      signingKey: {
        keyId: 'hsm-key-01',
        publicKey,
        algorithm: 'ECDSA_SHA_256',
        status: 'ACTIVE',
      },
      witnessReceipts: [
        {
          witnessId: mockWitnessId,
          witnessType: 'MOCK',
          receiptHash: mockWitnessHash,
          status: 'RECORDED',
        },
      ],
      witnessAssuranceState: 'TEST_ONLY',
    };

    const auditPackageApproval = {
      approverId: 'appr-lead-auditor-1',
      manifestCoreHash,
      authorizationDecisionId: 'auth-dec-001',
      approvedAt: '2026-09-07T08:30:00Z',
    };

    let manifest: any = {
      ...manifestCore,
      proofEnvelope,
      auditPackageApproval,
    };

    if (tamperFn) {
      tamperFn({ manifest, targetDir });
    }

    const { contentHash: packageEnvelopeHash } = hashCanonicalJson(manifest);

    const envelope = {
      packageId: 'pkg-audit-2026-q3',
      packageVersion: 1,
      packageEnvelopeHash,
    };

    fs.writeFileSync(path.join(targetDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    fs.writeFileSync(path.join(targetDir, 'envelope.json'), JSON.stringify(envelope, null, 2));
  }

  it('Positive Round-Trip: should successfully verify clean signed evidence package with offline verifier', () => {
    createSampleVerifiedPackage(tempDir);

    const result = verifyPackageDirectory(tempDir);
    if (result.overallResult !== 'CRYPTOGRAPHICALLY_VERIFIED_NOT_EXTERNALLY_WITNESSED') {
      console.log('DEBUG VERIFIER RESULT:', JSON.stringify(result, null, 2));
    }

    expect(result.overallResult).toBe('CRYPTOGRAPHICALLY_VERIFIED_NOT_EXTERNALLY_WITNESSED');
    expect(result.manifestValid).toBe(true);
    expect(result.schemaValid).toBe(true);
    expect(result.declaredEvidenceDigestsConsistent).toBe(true);
    expect(result.approvalBindingValid).toBe(true);
    expect(result.ledgerValid).toBe(true);
    expect(result.checkpointValid).toBe(true);
    expect(result.merkleProofValid).toBe(true);
    expect(result.signatureValid).toBe(true);
    expect(result.witnessesValid).toBe(true);
    expect(result.artifactBytesVerification).toBe('VERIFIED');
  });

  it('Tamper Negative 1 (Ledger Chain Break): should FAIL verification when ledger hash chain is mutated', () => {
    createSampleVerifiedPackage(tempDir, ({ manifest }) => {
      manifest.ledgerEntries[0].entryHash = 'f'.repeat(64);
    });

    const result = verifyPackageDirectory(tempDir);
    expect(result.overallResult).toBe('FAILED');
    expect(result.ledgerValid).toBe(false);
  });

  it('Tamper Negative 2 (Raw Byte Mutation): should report artifact byte mismatch when evidence content is altered', () => {
    createSampleVerifiedPackage(tempDir, ({ targetDir }) => {
      const evFilePath = path.join(targetDir, 'evidence', 'ev-001.json');
      fs.writeFileSync(evFilePath, JSON.stringify({ evidenceId: 'ev-001', status: 'COMPROMISED_MUTATION' }));
    });

    const result = verifyPackageDirectory(tempDir);
    expect(result.overallResult).toBe('FAILED');
    expect(result.artifactBytesVerification).toBe('FAILED');
  });

  it('Tamper Negative 3 (Approval / Core Hash Drift): should FAIL when approval hash does not match manifest core', () => {
    createSampleVerifiedPackage(tempDir, ({ manifest }) => {
      manifest.auditPackageApproval.manifestCoreHash = '0'.repeat(64);
    });

    const result = verifyPackageDirectory(tempDir);
    expect(result.overallResult).toBe('FAILED');
    expect(result.approvalBindingValid).toBe(false);
  });
});
