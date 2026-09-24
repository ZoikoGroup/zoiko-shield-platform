import { GcpKmsSigner } from '../../../../libs/kms/src/gcp-kms-signer';
import {
  canonicalCommandPayload,
  type CommandSignResult,
  type CommandSigningPayload,
  type GovernedCommandSigner,
} from './command-signer.interface';

/**
 * Production signing of governed response commands through a non-exportable
 * Google Cloud KMS key, mirroring the anchor checkpoint signer and the
 * evidence collector signer.
 *
 * Replaces the AWS KMS implementation. The private key is never in this
 * process. Verification is local against the exported public key, so a stored
 * command receipt stays checkable when KMS is unreachable.
 */
export class ProductionGovernedCommandSigner implements GovernedCommandSigner {
  private readonly signer: GcpKmsSigner;

  constructor() {
    const keyVersion = process.env.ACTION_COMMAND_KMS_KEY_VERSION ?? '';
    if (!keyVersion) {
      throw new Error(
        'ACTION_COMMAND_KMS_KEY_VERSION is required in production — governed response commands must be signed by a key in custody, not one generated in process memory.',
      );
    }
    this.signer = new GcpKmsSigner(keyVersion);
  }

  async sign(payload: CommandSigningPayload): Promise<CommandSignResult> {
    const message = canonicalCommandPayload(payload);
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
    payload: CommandSigningPayload,
    signature: string,
    publicKey: string,
  ): Promise<boolean> {
    return this.signer.verify(
      canonicalCommandPayload(payload),
      signature,
      publicKey,
    );
  }

  async publicKey() {
    return {
      signingKeyId: this.signer.keyId,
      publicKey: await this.signer.publicKey(),
      algorithm: this.signer.algorithm,
    };
  }
}
