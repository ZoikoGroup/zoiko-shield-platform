import { CryptographicShreddingService } from './cryptographic-shredding.service';
import { ForbiddenException } from '@nestjs/common';

describe('CryptographicShreddingService', () => {
  let shreddingService: CryptographicShreddingService;

  beforeEach(() => {
    process.env.SUBJECT_KEY_WRAPPING_SECRET = 'unit-test-wrapping-secret';
    shreddingService = new CryptographicShreddingService();
  });

  it('should encrypt and decrypt subject PII while key is active', async () => {
    const tenantId = 'tenant-healthcare-01';
    const subjectId = 'user-patient-9912';
    const sensitivePii =
      'Medical Record: Patient diagnosed with Type 2 Diabetes, SSN: 000-12-3456';

    const encrypted = await shreddingService.encryptSubjectPii(
      tenantId,
      subjectId,
      sensitivePii,
    );

    expect(encrypted.ciphertextHex).toBeDefined();
    expect(encrypted.authTagHex).toBeDefined();

    const decrypted = await shreddingService.decryptSubjectPii(encrypted);
    expect(decrypted).toBe(sensitivePii);
  });

  it('should permanently fail to decrypt and issue certificate upon cryptographic shredding', async () => {
    const tenantId = 'tenant-healthcare-01';
    const subjectId = 'user-patient-9912';
    const sensitivePii = 'Personal Name: John Doe, Email: john.doe@email.corp';

    const encrypted = await shreddingService.encryptSubjectPii(
      tenantId,
      subjectId,
      sensitivePii,
    );

    // Execute GDPR Article 17 Erasure (Crypto-Shred)
    const cert = await shreddingService.shredSubjectKey(tenantId, subjectId);

    expect(cert.certificateId).toBeDefined();
    expect(cert.merkleIntegrityPreserved).toBe(true);
    expect(cert.keyExisted).toBe(true);
    expect(cert.proofOfObliterationDigest).toBeDefined();

    // Subsequent decryption attempt MUST fail unconditionally
    await expect(shreddingService.decryptSubjectPii(encrypted)).rejects.toThrow(
      ForbiddenException,
    );

    await expect(
      shreddingService.encryptSubjectPii(
        tenantId,
        subjectId,
        'replacement data',
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should identify an erasure request for a subject without an active key', async () => {
    const cert = await shreddingService.shredSubjectKey(
      'tenant-healthcare-01',
      'unknown-subject',
    );

    expect(cert.keyExisted).toBe(false);
  });
});
