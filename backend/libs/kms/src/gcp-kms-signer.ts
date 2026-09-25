import { KeyManagementServiceClient } from '@google-cloud/kms';
import { createHash, createVerify } from 'crypto';

/**
 * Asymmetric signing through a non-exportable Google Cloud KMS key.
 *
 * Shared by every production signer in the platform — evidence checkpoints
 * (shield-anchor), evidence collectors (shield-core) and governed response
 * commands (shield-action) — so there is one implementation of the custody
 * boundary rather than three that can drift apart.
 *
 * Two things differ from the AWS KMS code this replaces, and both matter:
 *
 *  - Cloud KMS signs a *digest*, not a message. `asymmetricSign` takes
 *    `{ digest: { sha256 } }` for EC_SIGN_P256_SHA256, so the SHA-256 is
 *    computed here and the raw bytes never leave this process.
 *  - `getPublicKey` returns PEM directly, so there is no DER-to-PEM
 *    conversion step.
 *
 * The signature itself is DER-encoded ECDSA, the same as AWS produced, so
 * anything already verifying those signatures keeps working.
 */
export class GcpKmsSigner {
  private readonly client: KeyManagementServiceClient;
  private publicKeyPromise?: Promise<string>;

  /**
   * @param keyVersionName Full Cloud KMS key *version* resource name:
   *   projects/P/locations/L/keyRings/R/cryptoKeys/K/cryptoKeyVersions/V
   *   A version is required because a key can have several and a signature
   *   must name the one that produced it.
   */
  constructor(
    private readonly keyVersionName: string,
    readonly algorithm = 'EC_SIGN_P256_SHA256',
  ) {
    if (!keyVersionName) {
      throw new Error('A Cloud KMS key version resource name is required');
    }
    if (!/^projects\/[^/]+\/locations\/[^/]+\/keyRings\/[^/]+\/cryptoKeys\/[^/]+\/cryptoKeyVersions\/[^/]+$/.test(keyVersionName)) {
      // Caught here rather than as an opaque NOT_FOUND on the first signature,
      // which would surface at the moment evidence is being written.
      throw new Error(
        `'${keyVersionName}' is not a Cloud KMS key version resource name. Expected projects/P/locations/L/keyRings/R/cryptoKeys/K/cryptoKeyVersions/V`,
      );
    }
    this.client = new KeyManagementServiceClient();
  }

  /** Hex-encoded DER ECDSA signature over the SHA-256 of `message`. */
  async sign(message: string | Buffer): Promise<string> {
    const digest = createHash('sha256')
      .update(typeof message === 'string' ? Buffer.from(message, 'utf8') : message)
      .digest();

    const [response] = await this.client.asymmetricSign({
      name: this.keyVersionName,
      digest: { sha256: digest },
      // Cloud KMS rejects a corrupted request rather than signing the wrong
      // bytes, which is the failure mode worth paying for here.
      digestCrc32c: { value: crc32c(digest) },
    });

    if (!response.signature) {
      throw new Error('Cloud KMS returned no signature');
    }
    if (response.verifiedDigestCrc32c === false) {
      throw new Error('Cloud KMS reported the digest was corrupted in transit');
    }
    return Buffer.from(response.signature).toString('hex');
  }

  /**
   * The public key in PEM, fetched once and cached.
   *
   * Verification is done locally against this rather than by calling Cloud KMS,
   * so re-verifying stored evidence keeps working when KMS is unreachable.
   */
  async publicKey(): Promise<string> {
    this.publicKeyPromise ??= this.client
      .getPublicKey({ name: this.keyVersionName })
      .then(([response]: [any, any, any]) => {
        if (!response.pem) {
          throw new Error('Cloud KMS returned no public key');
        }
        return response.pem as string;
      });
    return this.publicKeyPromise;
  }

  async verify(
    message: string | Buffer,
    signatureHex: string,
    publicKeyPem?: string,
  ): Promise<boolean> {
    try {
      const verifier = createVerify('SHA256');
      verifier.update(
        typeof message === 'string' ? Buffer.from(message, 'utf8') : message,
      );
      verifier.end();
      return verifier.verify(
        publicKeyPem || (await this.publicKey()),
        Buffer.from(signatureHex, 'hex'),
      );
    } catch {
      // A malformed signature or key is a failed verification, not a crash.
      return false;
    }
  }

  /** The key id recorded alongside a signature. */
  get keyId(): string {
    return this.keyVersionName;
  }
}

/**
 * CRC32C (Castagnoli) — the integrity check Cloud KMS expects on a digest.
 * Implemented here rather than pulling in a dependency for one 8-line table.
 */
const CRC32C_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0x82f63b78 : crc >>> 1;
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

export function crc32c(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (crc >>> 8) ^ CRC32C_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}
