import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { runVerifier } from './main';

describe('Verifier CLI (Offline Independent Auditor Tool)', () => {
  const testPackageDir = path.resolve(
    __dirname,
    '../../../dist/test-audit-package',
  );

  beforeAll(() => {
    fs.mkdirSync(path.join(testPackageDir, 'evidence'), { recursive: true });
    fs.mkdirSync(path.join(testPackageDir, 'proofs'), { recursive: true });

    const packageId = 'test-pkg-001';
    const evidencePayload = { mfaEnforced: true, users: 100 };
    const contentHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(evidencePayload))
      .digest('hex');
    const entryHash = crypto
      .createHash('sha256')
      .update(`0000:${contentHash}:1`)
      .digest('hex');

    const manifestCore = {
      packageId,
      title: 'Test Compliance Package',
      tenantId: 'tenant-test-01',
      environmentId: 'test',
      merkleRoot: 'test-root-hash',
    };
    const manifestCoreHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(manifestCore))
      .digest('hex');

    const manifest = {
      packageId,
      manifestCore,
      manifestCoreHash,
      merkleRoot: 'test-root-hash',
      transparencyWitness: { witnessId: 'rekor-01' },
      humanApproval: { approver: 'auditor@test.com' },
    };

    fs.writeFileSync(
      path.join(testPackageDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8',
    );
    fs.writeFileSync(
      path.join(testPackageDir, 'envelope.json'),
      JSON.stringify({ packageId, packageEnvelopeHash: 'a'.repeat(64) }),
      'utf8',
    );
    fs.writeFileSync(
      path.join(testPackageDir, 'evidence', 'ACCESS_MFA.json'),
      JSON.stringify(evidencePayload, null, 2),
      'utf8',
    );
  });

  afterAll(() => {
    if (fs.existsSync(testPackageDir)) {
      fs.rmSync(testPackageDir, { recursive: true, force: true });
    }
  });

  it('should return error code 2 when no arguments are provided', () => {
    const exitCode = runVerifier([]);
    expect(exitCode).toBe(2);
  });

  it('should return error code 1 for non-existent package path', () => {
    const exitCode = runVerifier(['verify', '/invalid/path/does/not/exist']);
    expect(exitCode).toBe(1);
  });

  it('should verify test package and issue audit certificate', () => {
    const exitCode = runVerifier(['verify', testPackageDir]);
    expect(exitCode).toBe(0);

    const certPath = path.join(testPackageDir, 'audit_certificate.json');
    expect(fs.existsSync(certPath)).toBe(true);

    const certificate = JSON.parse(fs.readFileSync(certPath, 'utf8'));
    expect(certificate.verificationStatus).toBe('VERIFIED_COMPLIANT');
    expect(certificate.cryptographicSummary.certificateSignature).toBeDefined();
  });
});
