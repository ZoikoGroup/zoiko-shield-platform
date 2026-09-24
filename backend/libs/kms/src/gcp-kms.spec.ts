import { GcpKmsSigner, crc32c } from './gcp-kms-signer';
import { GcpKmsEnvelope } from './gcp-kms-envelope';

const VERSION_NAME =
  'projects/p/locations/europe-west2/keyRings/zoikoshield/cryptoKeys/anchor-checkpoint/cryptoKeyVersions/1';
const KEY_NAME =
  'projects/p/locations/europe-west2/keyRings/zoikoshield/cryptoKeys/subject-key-wrapping';

describe('GcpKmsSigner resource-name validation', () => {
  it('accepts a key version resource name', () => {
    expect(() => new GcpKmsSigner(VERSION_NAME)).not.toThrow();
  });

  it('rejects a crypto key where a version is required', () => {
    // Cloud KMS would answer NOT_FOUND on the first signature — at the moment
    // evidence is being written. Caught at construction instead.
    expect(() => new GcpKmsSigner(KEY_NAME)).toThrow(
      /not a Cloud KMS key version resource name/,
    );
  });

  it('rejects an empty name', () => {
    expect(() => new GcpKmsSigner('')).toThrow(/key version resource name is required/);
  });

  it('rejects a name that is not a Cloud KMS resource at all', () => {
    expect(() => new GcpKmsSigner('arn:aws:kms:eu-west-1:1234:key/abc')).toThrow(
      /not a Cloud KMS key version resource name/,
    );
  });

  it('reports the key version as the key id recorded with a signature', () => {
    expect(new GcpKmsSigner(VERSION_NAME).keyId).toBe(VERSION_NAME);
  });
});

describe('GcpKmsEnvelope resource-name validation', () => {
  it('accepts a crypto key resource name', () => {
    expect(() => new GcpKmsEnvelope(KEY_NAME)).not.toThrow();
  });

  it('rejects a key version where a crypto key is required', () => {
    // Symmetric encrypt/decrypt must resolve the primary version itself, or
    // rotating the key would strand every previously wrapped subject key.
    expect(() => new GcpKmsEnvelope(VERSION_NAME)).toThrow(
      /not a Cloud KMS crypto key resource name/,
    );
  });

  it('records the wrapping key reference against stored keys', () => {
    expect(new GcpKmsEnvelope(KEY_NAME).keyRef).toBe(`gcp-kms:${KEY_NAME}`);
  });
});

describe('crc32c', () => {
  // Castagnoli, the polynomial Cloud KMS uses to detect a corrupted request.
  // Known vectors: a wrong table would still be self-consistent, so these are
  // checked against published values rather than against our own output.
  it('matches known vectors', () => {
    expect(crc32c(Buffer.from(''))).toBe(0);
    expect(crc32c(Buffer.from('123456789'))).toBe(0xe3069283);
    expect(crc32c(Buffer.from('a'))).toBe(0xc1d04330);
  });

  it('changes when a single byte changes', () => {
    const a = crc32c(Buffer.from('zoikoshield evidence'));
    const b = crc32c(Buffer.from('zoikoshield evidencf'));
    expect(a).not.toBe(b);
  });

  it('stays within an unsigned 32-bit range', () => {
    const value = crc32c(Buffer.from('a'.repeat(1000)));
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(0xffffffff);
  });
});
