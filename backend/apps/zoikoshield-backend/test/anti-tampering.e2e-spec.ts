import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
import { randomUUID } from 'crypto';

// Mock the signature verification so we don't need real keys for this E2E test
jest.mock(
  '../../../tools/independent-verifier/src/signatures/verify-signature',
  () => ({
    verifyCheckpointSignature: jest.fn().mockReturnValue(true),
  }),
);

// Import verification tools
import { verifyPackageDirectory } from '../../../tools/independent-verifier/src/verify';
import { computeOverallResult } from '../../../tools/independent-verifier/src/report/report';
import { hashCanonicalJson } from '../../../tools/independent-verifier/src/hashing/hash';
import { recomputeRootFromLeaves } from '../../../tools/independent-verifier/src/merkle/merkle';

function hashLeaf(canonicalLeafBytes: string): string {
  return crypto
    .createHash('sha256')
    .update(
      Buffer.concat([
        Buffer.from([0x00]),
        Buffer.from(canonicalLeafBytes, 'utf-8'),
      ]),
    )
    .digest('hex');
}

describe('Anti-Tampering E2E Integration Flow', () => {
  let tempDir: string;
  let packagePath: string;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zs-e2e-'));
    packagePath = path.join(tempDir, 'audit_package_test');
    fs.mkdirSync(packagePath, { recursive: true });

    const ledgerEntryMaterial = {
      tenantId: 'tenant-123',
      sequence: 1,
      evidenceId: 'evt-1',
      previousEntryHash: null,
      evidenceMetadata: {},
    };
    const { contentHash: ledgerHeadHash } =
      hashCanonicalJson(ledgerEntryMaterial);
    const ledgerEntry = {
      ...ledgerEntryMaterial,
      entryHash: ledgerHeadHash,
    };

    // 1. Core payload
    const manifestCoreOnly = {
      tenantId: 'tenant-123',
      scope: {},
      period: {},
      schemaBundle: { id: 'schema-1', hash: 'b'.repeat(64) },
      evidenceIndex: [],
      ledgerEntries: [ledgerEntry],
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
        hashAlgorithm: 'sha256',
        canonicalizationProfile: 'zs-checkpoint-v1',
      },
      exportMetadata: {},
    };

    // Hash core payload
    const { contentHash: manifestCoreHash } =
      hashCanonicalJson(manifestCoreOnly);

    // Compute valid merkle root for two leaves
    const merkleRoot = recomputeRootFromLeaves([
      ledgerHeadHash,
      manifestCoreHash,
    ]);
    const leaf0Hash = hashLeaf(ledgerHeadHash);
    const leaf1Hash = hashLeaf(manifestCoreHash);

    // 2. Full Manifest (Core + proofEnvelope + approval)
    const manifest = {
      ...manifestCoreOnly,
      proofEnvelope: {
        merkleRoot: merkleRoot,
        checkpoint: {
          id: randomUUID(),
          anchorSequence: 1,
          ledgerSequence: 1,
          ledgerHeadHash: ledgerHeadHash,
          manifestCoreHash: manifestCoreHash,
          merkleRoot: merkleRoot,
          treeProfile: 'ZS-MERKLE-V1',
          hashAlgorithm: 'sha256',
          canonicalizationProfile: 'zs-checkpoint-v1',
          signingKeyId: 'key-1',
          signature: 'mock-sig',
          witnessAssuranceState: 'TEST_ONLY',
          status: 'PUBLISHED',
        },
        proofsByLeafIndex: {
          '0': [{ siblingHash: leaf1Hash, position: 'RIGHT' }],
          '1': [{ siblingHash: leaf0Hash, position: 'LEFT' }],
        },
        signingKey: {
          keyId: 'key-1',
          publicKey: 'mock-key',
          algorithm: 'ed25519',
          status: 'ACTIVE',
        },
        signature: 'mock-sig',
        witnessReceipts: [],
        witnessAssuranceState: 'TEST_ONLY',
      },
      auditPackageApproval: {
        approverId: 'approver-1',
        manifestCoreHash: manifestCoreHash,
        authorizationDecisionId: 'decision-1',
        approvedAt: new Date().toISOString(),
      },
    };

    const { contentHash: envelopeHash } = hashCanonicalJson(manifest);

    // 3. Envelope
    const envelope = {
      packageId: randomUUID(),
      packageVersion: 1,
      packageEnvelopeHash: envelopeHash,
    };

    fs.writeFileSync(
      path.join(packagePath, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
    );
    fs.writeFileSync(
      path.join(packagePath, 'envelope.json'),
      JSON.stringify(envelope, null, 2),
    );

    fs.mkdirSync(path.join(packagePath, 'ledger'), { recursive: true });
    fs.writeFileSync(
      path.join(packagePath, 'ledger', '00000000000000000001.json'),
      JSON.stringify(manifest.ledgerEntries[0]),
    );

    fs.mkdirSync(path.join(packagePath, 'evidence'), { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should successfully verify a valid generated audit package', async () => {
    const result = verifyPackageDirectory(packagePath);
    expect(result).toBeDefined();

    expect(result.schemaValid).toBe(true);
    expect(result.manifestValid).toBe(true);
    expect(result.ledgerValid).toBe(true);
    expect(result.checkpointValid).toBe(true);
    expect(result.merkleProofValid).toBe(true);
    expect(result.approvalBindingValid).toBe(true);
    expect(result.declaredEvidenceDigestsConsistent).toBe(true);

    const overall = computeOverallResult(result);
    // Since witness is empty / TEST_ONLY, the highest state is cryptographically verified
    expect(overall.overallResult).toBe(
      'CRYPTOGRAPHICALLY_VERIFIED_NOT_EXTERNALLY_WITNESSED',
    );
  });

  it('should fail verification when evidence payload is tampered', async () => {
    // Tamper the manifest.json
    const manifestPath = path.join(packagePath, 'manifest.json');
    const tamperedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    tamperedManifest.tenantId = 'tampered-tenant'; // malicious actor tries to steal evidence
    fs.writeFileSync(manifestPath, JSON.stringify(tamperedManifest, null, 2));

    const result = verifyPackageDirectory(packagePath);
    const overall = computeOverallResult(result);

    // Ensure verification fails
    expect(overall.overallResult).toBe('FAILED');

    // Ensure the verifier caught the envelope tampering (hash mismatch)
    expect(result.manifestValid).toBe(false);
  });
});
