import { KeyManagementServiceClient } from '@google-cloud/kms';
import { randomBytes } from 'crypto';
import { crc32c } from './gcp-kms-signer';

/**
 * Envelope encryption of data keys with a Google Cloud KMS symmetric key.
 *
 * Replaces AWS KMS `GenerateDataKey` / `Decrypt`. Cloud KMS has no
 * GenerateDataKey equivalent: the data key is generated here with
 * `crypto.randomBytes` and wrapped by calling `encrypt`. That is the
 * documented Cloud KMS envelope pattern, and it is not weaker than the AWS
 * one in practice — `GenerateDataKey` also returns the plaintext key to the
 * caller, so the key exists in this process either way. What differs is only
 * where the random bytes come from.
 *
 * The wrapping key is never in this process, which is the property that
 * matters: shredding a subject means the wrapped key can no longer be
 * unwrapped by anyone, including us.
 */
export class GcpKmsEnvelope {
  private readonly client: KeyManagementServiceClient;

  /**
   * @param cryptoKeyName Full Cloud KMS *crypto key* resource name (not a
   *   version — symmetric encrypt/decrypt resolves the primary version
   *   itself, so key rotation does not strand previously wrapped keys):
   *   projects/P/locations/L/keyRings/R/cryptoKeys/K
   */
  constructor(private readonly cryptoKeyName: string) {
    if (!/^projects\/[^/]+\/locations\/[^/]+\/keyRings\/[^/]+\/cryptoKeys\/[^/]+$/.test(cryptoKeyName)) {
      throw new Error(
        `'${cryptoKeyName}' is not a Cloud KMS crypto key resource name. Expected projects/P/locations/L/keyRings/R/cryptoKeys/K`,
      );
    }
    this.client = new KeyManagementServiceClient();
  }

  /** A fresh 256-bit data key, wrapped by KMS and returned base64-encoded. */
  async generateWrappedKey(): Promise<string> {
    const dataKey = randomBytes(32);
    const [response] = await this.client.encrypt({
      name: this.cryptoKeyName,
      plaintext: dataKey,
      plaintextCrc32c: { value: crc32c(dataKey) },
    });
    if (!response.ciphertext) {
      throw new Error('Cloud KMS returned no wrapped subject key');
    }
    if (response.verifiedPlaintextCrc32c === false) {
      throw new Error('Cloud KMS reported the data key was corrupted in transit');
    }
    return Buffer.from(response.ciphertext).toString('base64');
  }

  async unwrapKey(wrappedKeyBase64: string): Promise<Buffer> {
    const ciphertext = Buffer.from(wrappedKeyBase64, 'base64');
    const [response] = await this.client.decrypt({
      name: this.cryptoKeyName,
      ciphertext,
      ciphertextCrc32c: { value: crc32c(ciphertext) },
    });
    if (!response.plaintext) {
      throw new Error('Cloud KMS returned no subject key plaintext');
    }
    return Buffer.from(response.plaintext);
  }

  get keyRef(): string {
    return `gcp-kms:${this.cryptoKeyName}`;
  }
}
