import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { StandaloneVerifierRunner } from './standalone-verifier-runner';
import { StandaloneMerkleVerifier } from './merkle/standalone-merkle-verifier';

describe('StandaloneVerifierRunner', () => {
  let runner: StandaloneVerifierRunner;
  let tempDir: string;

  beforeEach(() => {
    runner = new StandaloneVerifierRunner();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zs-sea-audit-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should verify a valid audit package correctly offline', () => {
    const evidenceDir = path.join(tempDir, 'evidence');
    fs.mkdirSync(evidenceDir, { recursive: true });

    const file1Content = 'Log entry 1: Admin logged in';
    const file1Hash = crypto
      .createHash('sha256')
      .update(file1Content)
      .digest('hex');
    fs.writeFileSync(path.join(evidenceDir, 'auth-log.txt'), file1Content);

    const merkleVerifier = new StandaloneMerkleVerifier();
    const merkleRoot = merkleVerifier.build([file1Hash]).root;

    const manifest = {
      packageId: 'pkg-100',
      title: 'SOC2 Evidence Package',
      tenantId: 'tenant-acme',
      environmentId: 'prod',
      merkleRoot,
      evidenceFiles: [{ filename: 'auth-log.txt', sha256: file1Hash }],
    };
    fs.writeFileSync(
      path.join(tempDir, 'manifest.json'),
      JSON.stringify(manifest),
    );

    const envelope = {
      packageId: 'pkg-100',
      tenantId: 'tenant-acme',
      merkleRoot,
      signedAt: new Date().toISOString(),
      witnessAttestation: { signature: 'sig-witness-valid' },
      humanSignatures: [{ signer: 'ciso@acme.com', signature: 'sig-human-1' }],
    };
    fs.writeFileSync(
      path.join(tempDir, 'package-envelope.json'),
      JSON.stringify(envelope),
    );

    const cert = runner.verifyOfflinePackage({ packagePath: tempDir });

    expect(cert.verificationStatus).toBe('VERIFIED_COMPLIANT');
    expect(cert.checks.merkleRootIntegrity).toBe(true);
    expect(cert.checks.evidenceFilesIntegrity.validFiles).toBe(1);
    expect(cert.checks.evidenceFilesIntegrity.corruptedFiles).toBe(0);
  });

  it('should detect tampering when evidence file content changes', () => {
    const evidenceDir = path.join(tempDir, 'evidence');
    fs.mkdirSync(evidenceDir, { recursive: true });

    const file1Content = 'Original content';
    const file1Hash = crypto
      .createHash('sha256')
      .update(file1Content)
      .digest('hex');
    // Write tampered content
    fs.writeFileSync(
      path.join(evidenceDir, 'auth-log.txt'),
      'Tampered content altered by attacker',
    );

    const merkleVerifier = new StandaloneMerkleVerifier();
    const merkleRoot = merkleVerifier.build([file1Hash]).root;

    const manifest = {
      packageId: 'pkg-100',
      title: 'SOC2 Evidence Package',
      tenantId: 'tenant-acme',
      merkleRoot,
      evidenceFiles: [{ filename: 'auth-log.txt', sha256: file1Hash }],
    };
    fs.writeFileSync(
      path.join(tempDir, 'manifest.json'),
      JSON.stringify(manifest),
    );

    const envelope = {
      packageId: 'pkg-100',
      tenantId: 'tenant-acme',
      merkleRoot,
      signedAt: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(tempDir, 'package-envelope.json'),
      JSON.stringify(envelope),
    );

    const cert = runner.verifyOfflinePackage({ packagePath: tempDir });

    expect(cert.verificationStatus).toBe('TAMPER_DETECTED');
    expect(cert.checks.merkleRootIntegrity).toBe(false);
    expect(cert.checks.evidenceFilesIntegrity.corruptedFiles).toBe(1);
  });

  it('should verify offline notification receipts and detect tampered hashes', () => {
    const canonicalString = [
      'del-101',
      'tenant-acme',
      'evt-sec-01',
      1,
      'ZS-EML-SEC-001',
      2,
      'pol-critical',
      1,
      crypto.createHash('sha256').update('admin@acme.com').digest('hex'),
      'render-hash-1',
      'digest-1',
      'security_sender',
      '2026-10-07T12:00:00.000Z',
    ].join('|');

    const validAuditHash = crypto
      .createHash('sha256')
      .update(canonicalString)
      .digest('hex');

    const validReceipt = {
      deliveryId: 'del-101',
      tenantId: 'tenant-acme',
      eventId: 'evt-sec-01',
      eventVersion: 1,
      templateId: 'ZS-EML-SEC-001',
      templateVersion: 2,
      policyId: 'pol-critical',
      policyVersion: 1,
      recipientEmail: 'admin@acme.com',
      renderHash: 'render-hash-1',
      contentDigest: 'digest-1',
      senderClass: 'security_sender',
      dispatchedAt: '2026-10-07T12:00:00.000Z',
      auditHash: validAuditHash,
    };

    const validResult = runner.verifyNotificationReceipt(validReceipt);
    expect(validResult.verified).toBe(true);
    expect(validResult.status).toBe('AUDIT_VERIFIED');

    // Tampered test
    const tamperedReceipt = {
      ...validReceipt,
      auditHash: 'fake-tampered-hash-0000000000000000000000000000000000000000000000',
    };
    const tamperedResult = runner.verifyNotificationReceipt(tamperedReceipt);
    expect(tamperedResult.verified).toBe(false);
    expect(tamperedResult.status).toBe('TAMPER_DETECTED');
  });
});

