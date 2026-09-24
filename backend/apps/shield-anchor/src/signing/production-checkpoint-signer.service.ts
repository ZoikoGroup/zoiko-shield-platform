import { GcpKmsSigner } from '../../../../libs/kms/src/gcp-kms-signer';
import type {
  CheckpointSigner,
  CheckpointSignResult,
} from './checkpoint-signer.interface';

/**
 * Production checkpoint signing through a non-exportable Google Cloud KMS key.
 *
 * Replaces the AWS KMS implementation. The private key is never in this
 * process either way; what changed is which cloud holds it, and that Cloud KMS
 * signs a digest rather than a message — handled inside GcpKmsSigner.
 *
 * The signature is still DER-encoded ECDSA P-256, so checkpoints signed by the
 * previous implementation remain verifiable against their recorded public key.
 */
export class ProductionCheckpointSigner implements CheckpointSigner {
  private readonly signer: GcpKmsSigner;

  constructor() {
    const keyVersion = process.env.ANCHOR_KMS_KEY_VERSION ?? '';
    if (!keyVersion) {
      throw new Error(
        'ANCHOR_KMS_KEY_VERSION is required in production — evidence checkpoints must be signed by a key in custody, not one generated in process memory.',
      );
    }
    this.signer = new GcpKmsSigner(keyVersion);
  }

  async sign(merkleRoot: string): Promise<CheckpointSignResult> {
    const [signature, publicKey] = await Promise.all([
      this.signer.sign(merkleRoot),
      this.signer.publicKey(),
    ]);
    return {
      signature,
      signingKeyId: this.signer.keyId,
      publicKey,
      algorithm: this.signer.algorithm,
    };
  }
}
