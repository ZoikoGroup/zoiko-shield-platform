import { GcpKmsSigner } from '../../../../../../libs/kms/src/gcp-kms-signer';
import type {
  CollectorSigner,
  CollectorSignResult,
  CollectorSigningPayload,
} from './collector-signer.interface';
import { canonicalCollectorPayload } from './collector-signer.interface';

/**
 * Production collector signing through a non-exportable Google Cloud KMS key,
 * mirroring the anchor checkpoint signer and the governed command signer.
 *
 * Replaces the AWS KMS implementation. Verification is done locally against
 * the exported public key rather than round-tripping to KMS: re-verifying
 * stored evidence must keep working even when KMS is unreachable.
 */
export class ProductionCollectorSigner implements CollectorSigner {
  private readonly signer: GcpKmsSigner;

  constructor() {
    const keyVersion = process.env.COLLECTOR_KMS_KEY_VERSION ?? '';
    if (!keyVersion) {
      throw new Error(
        'COLLECTOR_KMS_KEY_VERSION is required in production — evidence must be bound to a collector by a key in custody.',
      );
    }
    this.signer = new GcpKmsSigner(keyVersion);
  }

  async sign(payload: CollectorSigningPayload): Promise<CollectorSignResult> {
    const message = canonicalCollectorPayload(payload);
    const [signature, publicKey] = await Promise.all([
      this.signer.sign(message),
      this.signer.publicKey(),
    ]);
    return {
      signature,
      signingKeyId: this.signer.keyId,
      publicKey,
      algorithm: this.signer.algorithm,
    };
  }

  async verify(
    payload: CollectorSigningPayload,
    signature: string,
    publicKey: string,
  ): Promise<boolean> {
    return this.signer.verify(
      canonicalCollectorPayload(payload),
      signature,
      publicKey,
    );
  }
}
