import { CryptographicShreddingService } from './cryptographic-shredding.service';
import { ForbiddenException } from '@nestjs/common';

describe('CryptographicShreddingService', () => {
  let shreddingService: CryptographicShreddingService;

  beforeEach(() => {
    shreddingService = new CryptographicShreddingService();
  });

  it('should encrypt and decrypt subject PII while key is active', () => {
    const tenantId = 'tenant-healthcare-01';
    const subjectId = 'user-patient-9912';
    const sensitivePii = 'Medical Record: Patient diagnosed with Type 2 Diabetes, SSN: 000-12-3456';

    const encrypted = shreddingService.encryptSubjectPii(tenantId, subjectId, sensitivePii);

    expect(encrypted.ciphertextHex).toBeDefined();
    expect(encrypted.authTagHex).toBeDefined();

    const decrypted = shreddingService.decryptSubjectPii(encrypted);
    expect(decrypted).toBe(sensitivePii);
  });

  it('should permanently fail to decrypt and issue certificate upon cryptographic shredding', () => {
    const tenantId = 'tenant-healthcare-01';
    const subjectId = 'user-patient-9912';
    const sensitivePii = 'Personal Name: John Doe, Email: john.doe@email.corp';

    const encrypted = shreddingService.encryptSubjectPii(tenantId, subjectId, sensitivePii);

    // Execute GDPR Article 17 Erasure (Crypto-Shred)
    const cert = shreddingService.shredSubjectKey(tenantId, subjectId);

    expect(cert.certificateId).toBeDefined();
    expect(cert.merkleIntegrityPreserved).toBe(true);
    expect(cert.proofOfObliterationDigest).toBeDefined();

    // Subsequent decryption attempt MUST fail unconditionally
    expect(() => {
      shreddingService.decryptSubjectPii(encrypted);
    }).toThrow(ForbiddenException);
  });
});
