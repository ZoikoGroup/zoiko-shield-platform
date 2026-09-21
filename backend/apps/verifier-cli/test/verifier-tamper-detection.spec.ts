import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { runVerifier } from '../src/main';
import { StandaloneMerkleVerifier } from '../src/merkle/standalone-merkle-verifier';

describe('Verifier CLI Adversarial Tamper Detection Suite (ADR-01 & Spec §9)', () => {
  const baseFixtureDir = path.resolve(
    __dirname,
    '../../../dist/tamper-test-audit-package',
  );

  function createPackageFixture(
    dir: string,
    overrides: {
      corruptEvidenceFile?: boolean;
      corruptMerkleRoot?: boolean;
      corruptManifestCore?: boolean;
      missingManifest?: boolean;
    } = {},
  ) {
    fs.mkdirSync(path.join(dir, 'evidence'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'proofs'), { recursive: true });

    const packageId = 'pkg-tamper-test-001';
    const evidencePayload = {
      mfaEnforced: true,
      compliantUsers: 450,
      totalUsers: 450,
    };
    const contentHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(evidencePayload))
      .digest('hex');
    const entryHash = crypto
      .createHash('sha256')
      .update(`0000:${contentHash}:1`)
      .digest('hex');

    const merkleVerifier = new StandaloneMerkleVerifier();
    const merkleTree = merkleVerifier.build([entryHash]);
    const originalMerkleRoot = merkleTree.root;
    const declaredMerkleRoot = overrides.corruptMerkleRoot
      ? 'deadbeef'.repeat(8)
      : originalMerkleRoot;

    const manifestCore = {
      packageId,
      title: overrides.corruptManifestCore
        ? 'Altered Audit Package Title'
        : 'ZoikoShield Certified SOC2 Trust Package',
      tenantId: overrides.corruptManifestCore
        ? 'malicious-injected-tenant-id'
        : '00000000-0000-4000-8000-000000000001',
      environmentId: 'production',
      merkleRoot: declaredMerkleRoot,
    };

    // If corruptManifestCore is true, manifestCoreHash will not match the hash of manifestCore
    const manifestCoreHash = overrides.corruptManifestCore
      ? 'badhash'.padEnd(64, '0')
      : crypto
          .createHash('sha256')
          .update(JSON.stringify(manifestCore))
          .digest('hex');

    const manifest = {
      packageId,
      manifestCore,
      manifestCoreHash,
      merkleRoot: declaredMerkleRoot,
      transparencyWitness: {
        witnessId: 'rekor-witness-01',
        timestamp: new Date().toISOString(),
      },
      humanApproval: {
        approver: 'auditor-lead@zoiko.com',
        role: 'CHIEF_COMPLIANCE_OFFICER',
      },
    };

    if (!overrides.missingManifest) {
      fs.writeFileSync(
        path.join(dir, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
        'utf8',
      );
    }

    fs.writeFileSync(
      path.join(dir, 'envelope.json'),
      JSON.stringify({ packageId, packageEnvelopeHash: '0'.repeat(64) }),
      'utf8',
    );

    // If corruptEvidenceFile is true, write altered payload that conflicts with contentHash
    const savedEvidencePayload = overrides.corruptEvidenceFile
      ? {
          mfaEnforced: false,
          compliantUsers: 0,
          totalUsers: 450,
          backdoor: true,
        }
      : evidencePayload;

    fs.writeFileSync(
      path.join(dir, 'evidence', 'SOC2_CC6_1_MFA.json'),
      JSON.stringify(savedEvidencePayload, null, 2),
      'utf8',
    );

    fs.writeFileSync(
      path.join(dir, 'evidence_index.jsonl'),
      JSON.stringify({ type: 'SOC2_CC6_1_MFA', contentHash, entryHash }) + '\n',
      'utf8',
    );
  }

  afterEach(() => {
    if (fs.existsSync(baseFixtureDir)) {
      fs.rmSync(baseFixtureDir, { recursive: true, force: true });
    }
  });

  it('Scenario 0: Untampered baseline package verifies with exit code 0 and VERIFIED_COMPLIANT status', () => {
    createPackageFixture(baseFixtureDir);
    const exitCode = runVerifier(['verify', baseFixtureDir]);
    expect(exitCode).toBe(0);

    const certPath = path.join(baseFixtureDir, 'audit_certificate.json');
    const cert = JSON.parse(fs.readFileSync(certPath, 'utf8'));
    expect(cert.verificationStatus).toBe('VERIFIED_COMPLIANT');
    expect(cert.checks.merkleRootIntegrity).toBe(true);
    expect(cert.checks.manifestCoreHashMatch).toBe(true);
    expect(cert.checks.evidenceFilesIntegrity.corruptedFiles).toBe(0);
  });

  it('Scenario 1: Bit-flip inside evidence file triggers TAMPER_DETECTED with exit code 1', () => {
    createPackageFixture(baseFixtureDir, { corruptEvidenceFile: true });
    const exitCode = runVerifier(['verify', baseFixtureDir]);
    expect(exitCode).toBe(1);

    const certPath = path.join(baseFixtureDir, 'audit_certificate.json');
    const cert = JSON.parse(fs.readFileSync(certPath, 'utf8'));
    expect(cert.verificationStatus).toBe('TAMPER_DETECTED');
    expect(cert.checks.evidenceFilesIntegrity.corruptedFiles).toBeGreaterThan(
      0,
    );
  });

  it('Scenario 2: Tampered Merkle Root in manifest triggers TAMPER_DETECTED with exit code 1', () => {
    createPackageFixture(baseFixtureDir, { corruptMerkleRoot: true });
    const exitCode = runVerifier(['verify', baseFixtureDir]);
    expect(exitCode).toBe(1);

    const certPath = path.join(baseFixtureDir, 'audit_certificate.json');
    const cert = JSON.parse(fs.readFileSync(certPath, 'utf8'));
    expect(cert.verificationStatus).toBe('TAMPER_DETECTED');
    expect(cert.checks.merkleRootIntegrity).toBe(false);
  });

  it('Scenario 3: Tampered ManifestCore metadata triggers TAMPER_DETECTED with exit code 1', () => {
    createPackageFixture(baseFixtureDir, { corruptManifestCore: true });
    const exitCode = runVerifier(['verify', baseFixtureDir]);
    expect(exitCode).toBe(1);

    const certPath = path.join(baseFixtureDir, 'audit_certificate.json');
    const cert = JSON.parse(fs.readFileSync(certPath, 'utf8'));
    expect(cert.verificationStatus).toBe('TAMPER_DETECTED');
    expect(cert.checks.manifestCoreHashMatch).toBe(false);
  });

  it('Scenario 4: Missing manifest.json triggers early failure with exit code 1', () => {
    createPackageFixture(baseFixtureDir, { missingManifest: true });
    const exitCode = runVerifier(['verify', baseFixtureDir]);
    expect(exitCode).toBe(1);
  });

  it('Scenario 5: Invalid CLI parameters triggers usage failure with exit code 2', () => {
    expect(runVerifier([])).toBe(2);
    expect(runVerifier(['invalid-subcommand'])).toBe(2);
  });

  it('Scenario 6: Machine-readable --json flag successfully formats output without runtime errors', () => {
    createPackageFixture(baseFixtureDir);
    const stdoutSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    const exitCode = runVerifier(['verify', baseFixtureDir, '--json']);
    expect(exitCode).toBe(0);
    expect(stdoutSpy).toHaveBeenCalled();

    const emittedJson = stdoutSpy.mock.calls.map((c) => c[0]).join('');
    const parsedCert = JSON.parse(emittedJson);
    expect(parsedCert.verificationStatus).toBe('VERIFIED_COMPLIANT');

    stdoutSpy.mockRestore();
  });
});
