import { createPublicKey, createVerify } from 'crypto';
import {
  GetPublicKeyCommand,
  KMSClient,
  SignCommand,
  type SigningAlgorithmSpec,
} from '@aws-sdk/client-kms';
import {
  canonicalCommandPayload,
  type CommandSignResult,
  type CommandSigningPayload,
  type GovernedCommandSigner,
} from './command-signer.interface';

const SUPPORTED_ALGORITHMS = new Set<SigningAlgorithmSpec>(['ECDSA_SHA_256']);

/**
 * Production signing of governed response commands through a non-exportable
 * AWS KMS key, mirroring the anchor checkpoint signer and the evidence
 * collector signer.
 *
 * The private key is never in this process. Verification is done locally
 * against the exported public key rather than round-tripping to KMS, so
 * re-verifying a stored command receipt keeps working when KMS is
 * unreachable.
 */
export class ProductionGovernedCommandSigner implements GovernedCommandSigner {
  private readonly keyId: string;
  private readonly algorithm: SigningAlgorithmSpec;
  private readonly client: KMSClient;
  private publicKeyPromise?: Promise<string>;

  constructor() {
    this.keyId = process.env.ACTION_COMMAND_KMS_KEY_ID ?? '';
    this.algorithm = (process.env.ACTION_COMMAND_KMS_SIGNING_ALGORITHM ??
      'ECDSA_SHA_256') as SigningAlgorithmSpec;
    if (!this.keyId) {
      throw new Error(
        'ACTION_COMMAND_KMS_KEY_ID is required in production — governed response commands must be signed by a key in custody, not one generated in process memory.',
      );
    }
    if (!SUPPORTED_ALGORITHMS.has(this.algorithm)) {
      throw new Error(
        `Unsupported ACTION_COMMAND_KMS_SIGNING_ALGORITHM '${this.algorithm}'`,
      );
    }
    this.client = new KMSClient({ region: process.env.AWS_REGION });
  }

  async sign(payload: CommandSigningPayload): Promise<CommandSignResult> {
    const message = Buffer.from(canonicalCommandPayload(payload), 'utf-8');
    const [outcome, publicKey] = await Promise.all([
      this.client.send(
        new SignCommand({
          KeyId: this.keyId,
          Message: message,
          MessageType: 'RAW',
          SigningAlgorithm: this.algorithm,
        }),
      ),
      this.exportedPublicKey(),
    ]);
    if (!outcome.Signature) {
      throw new Error('AWS KMS returned no command signature');
    }
    return {
      signature: Buffer.from(outcome.Signature).toString('hex'),
      signingKeyId: outcome.KeyId ?? this.keyId,
      publicKey,
      algorithm: this.algorithm,
    };
  }

  async verify(
    payload: CommandSigningPayload,
    signature: string,
    publicKey: string,
  ): Promise<boolean> {
    try {
      const verifier = createVerify('SHA256');
      verifier.update(canonicalCommandPayload(payload));
      verifier.end();
      return verifier.verify(
        publicKey || (await this.exportedPublicKey()),
        Buffer.from(signature, 'hex'),
      );
    } catch {
      return false;
    }
  }

  async publicKey() {
    return {
      signingKeyId: this.keyId,
      publicKey: await this.exportedPublicKey(),
      algorithm: this.algorithm,
    };
  }

  private exportedPublicKey(): Promise<string> {
    this.publicKeyPromise ??= this.client
      .send(new GetPublicKeyCommand({ KeyId: this.keyId }))
      .then((outcome) => {
        if (!outcome.PublicKey) {
          throw new Error('AWS KMS returned no command public key');
        }
        return createPublicKey({
          key: Buffer.from(outcome.PublicKey),
          format: 'der',
          type: 'spki',
        })
          .export({ type: 'spki', format: 'pem' })
          .toString();
      });
    return this.publicKeyPromise;
  }
}
