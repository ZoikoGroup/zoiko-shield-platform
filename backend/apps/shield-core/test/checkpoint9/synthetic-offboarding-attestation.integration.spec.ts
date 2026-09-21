import { ForbiddenException } from '@nestjs/common';
import { CryptographicShreddingService } from '../../src/modules/privacy/cryptographic-shredding.service';

describe('Checkpoint 9 - Synthetic Offboarding Attestation Integration Suite (IC-07)', () => {
  let shredder: CryptographicShreddingService;
  const TENANT_ID = '99999999-9999-4000-8000-000000000099';
  const SUBJECT_ID = 'sub-cust-gdpr-7788';

  beforeAll(() => {
    process.env.SUBJECT_KEY_WRAPPING_SECRET =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  beforeEach(() => {
    shredder = new CryptographicShreddingService();
  });

  describe('1. Tenant Data Export & Cryptographic Wrapping', () => {
    it('should encrypt sensitive customer PII under a unique dedicated key version', async () => {
      const piiCleartext = JSON.stringify({
        fullName: 'Alice Johnson',
        email: 'alice.johnson@tenant99-enterprise.com',
        billingAccount: 'ACC-8839-2026',
        ssnLast4: '4491',
      });

      const encrypted = await shredder.encryptSubjectPii(
        TENANT_ID,
        SUBJECT_ID,
        piiCleartext,
      );

      expect(encrypted.tenantId).toBe(TENANT_ID);
      expect(encrypted.subjectId).toBe(SUBJECT_ID);
      expect(encrypted.ciphertextHex).toBeDefined();
      expect(encrypted.ciphertextHex).not.toContain('alice.johnson');

      // Decryption prior to shredding succeeds
      const decrypted = await shredder.decryptSubjectPii(encrypted);
      expect(decrypted).toBe(piiCleartext);
    });
  });

  describe('2. Key Destruction & Irreversible Cryptographic Shredding', () => {
    it('should destroy the subject key and produce a valid Erasure Certificate', async () => {
      const piiCleartext = 'CONFIDENTIAL_HEALTHCARE_RECORD_XYZ';
      const encrypted = await shredder.encryptSubjectPii(
        TENANT_ID,
        SUBJECT_ID,
        piiCleartext,
      );

      // Perform cryptographic shredding
      const cert = await shredder.shredSubjectKey(TENANT_ID, SUBJECT_ID);

      expect(cert.tenantId).toBe(TENANT_ID);
      expect(cert.subjectId).toBe(SUBJECT_ID);
      expect(cert.certificateId).toBeDefined();
      expect(cert.proofOfObliterationDigest).toBeDefined();
      expect(cert.merkleIntegrityPreserved).toBe(true);
      expect(cert.keyExisted).toBe(true);

      // Post-shredding decryption attempt MUST fail with ForbiddenException (key destroyed)
      await expect(shredder.decryptSubjectPii(encrypted)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
