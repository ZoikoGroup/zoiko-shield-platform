import * as crypto from 'crypto';

/**
 * GcpKmsEnvelope's own correctness (real Cloud KMS encrypt/decrypt) is that
 * class's concern (libs/kms/src/gcp-kms.spec.ts). This mock is a
 * self-consistent stand-in, keyed by the crypto key resource name passed to
 * the constructor, so this spec can prove: (a) each share is wrapped under
 * its own distinct key, (b) round-trip reconstruction works, and (c) a
 * share wrapped under one key cannot be unwrapped with another.
 */
const deriveMockKey = (keyName: string) =>
  crypto.createHash('sha256').update(keyName).digest();

jest.mock('../../../../../libs/kms/src/gcp-kms-envelope', () => ({
  GcpKmsEnvelope: jest.fn().mockImplementation((keyName: string) => ({
    wrap: async (plaintext: Buffer) => {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv(
        'aes-256-gcm',
        deriveMockKey(keyName),
        iv,
      );
      const ciphertext = Buffer.concat([
        cipher.update(plaintext),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();
      return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
    },
    unwrap: async (wrappedBase64: string) => {
      const buf = Buffer.from(wrappedBase64, 'base64');
      const iv = buf.subarray(0, 12);
      const authTag = buf.subarray(12, 28);
      const ciphertext = buf.subarray(28);
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        deriveMockKey(keyName),
        iv,
      );
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    },
  })),
}));

import { SplitKmsEscrowService } from './split-kms-escrow.service';

describe('SplitKmsEscrowService (real 3-of-3 XOR split, GCP KMS-wrapped)', () => {
  let escrowService: SplitKmsEscrowService;
  const config = {
    gcpKmsKeyNames: [
      'projects/p/locations/europe-west3/keyRings/r/cryptoKeys/escrow-share-1',
      'projects/p/locations/europe-west3/keyRings/r/cryptoKeys/escrow-share-2',
      'projects/p/locations/europe-west3/keyRings/r/cryptoKeys/escrow-share-3',
    ] as [string, string, string],
  };

  beforeEach(() => {
    escrowService = new SplitKmsEscrowService();
  });

  it('should generate a split master key wrapped by 3 distinct GCP KMS keys and reconstruct the exact plaintext key', async () => {
    const tenantId = 'tenant-sovereign-bank-01';

    const { masterKeyHex, wrappedPackage } =
      await escrowService.generateAndWrapSplitMasterKey(
        tenantId,
        'EVIDENCE_VAULT_ENCRYPTION',
        config,
      );

    expect(masterKeyHex).toBeDefined();
    expect(wrappedPackage.keyId).toBeDefined();
    expect(wrappedPackage.shares.length).toBe(3);
    expect(wrappedPackage.attestationDigest).toBeDefined();
    // Each share is wrapped under a distinct key resource.
    expect(
      new Set(wrappedPackage.shares.map((s) => s.keyResourceIdentifier)).size,
    ).toBe(3);

    const reconstructedHex =
      await escrowService.unwrapAndReconstructMasterKey(wrappedPackage);
    expect(reconstructedHex).toBe(masterKeyHex);
  });

  it('should refuse to reconstruct from an incomplete share set', async () => {
    const { wrappedPackage } =
      await escrowService.generateAndWrapSplitMasterKey(
        'tenant-x',
        'TEST',
        config,
      );
    const incomplete = {
      ...wrappedPackage,
      shares: wrappedPackage.shares.slice(0, 2),
    };

    await expect(
      escrowService.unwrapAndReconstructMasterKey(incomplete),
    ).rejects.toThrow(/Incomplete key shares/);
  });

  it('should fail to unwrap a share under the wrong key (proves each share is bound to its own key)', async () => {
    const { wrappedPackage } =
      await escrowService.generateAndWrapSplitMasterKey(
        'tenant-y',
        'TEST',
        config,
      );
    // Swap two shares' key resource identifiers without swapping their
    // ciphertext — each is now claimed to be wrapped under the wrong key.
    const tampered = {
      ...wrappedPackage,
      shares: [
        {
          ...wrappedPackage.shares[0],
          keyResourceIdentifier: config.gcpKmsKeyNames[1],
        },
        {
          ...wrappedPackage.shares[1],
          keyResourceIdentifier: config.gcpKmsKeyNames[0],
        },
        wrappedPackage.shares[2],
      ],
    };

    await expect(
      escrowService.unwrapAndReconstructMasterKey(tampered),
    ).rejects.toThrow();
  });
});
