import { createPublicKey } from 'crypto';
import {
  GetPublicKeyCommand,
  KMSClient,
  SignCommand,
  type SigningAlgorithmSpec,
} from '@aws-sdk/client-kms';
import type { CheckpointSigner, CheckpointSignResult } from './checkpoint-signer.interface';

const SUPPORTED_ALGORITHMS = new Set<SigningAlgorithmSpec>([
  'ECDSA_SHA_256',
]);

/** Production checkpoint signing through a non-exportable AWS KMS key. */
export class ProductionCheckpointSigner implements CheckpointSigner {
  private readonly keyId: string;
  private readonly algorithm: SigningAlgorithmSpec;
  private readonly client: KMSClient;
  private publicKeyPromise?: Promise<string>;

  constructor() {
    this.keyId = process.env.ANCHOR_KMS_KEY_ID ?? '';
    this.algorithm = (process.env.ANCHOR_KMS_SIGNING_ALGORITHM ?? 'ECDSA_SHA_256') as SigningAlgorithmSpec;
    if (!this.keyId) throw new Error('ANCHOR_KMS_KEY_ID is required in production');
    if (!SUPPORTED_ALGORITHMS.has(this.algorithm)) {
      throw new Error(`Unsupported ANCHOR_KMS_SIGNING_ALGORITHM '${this.algorithm}'`);
    }
    this.client = new KMSClient({ region: process.env.AWS_REGION });
  }

  async sign(merkleRoot: string): Promise<CheckpointSignResult> {
    const [outcome, publicKey] = await Promise.all([
      this.client.send(new SignCommand({
        KeyId: this.keyId,
        Message: Buffer.from(merkleRoot, 'utf8'),
        MessageType: 'RAW',
        SigningAlgorithm: this.algorithm,
      })),
      this.publicKey(),
    ]);
    if (!outcome.Signature) throw new Error('AWS KMS returned no checkpoint signature');
    return {
      signature: Buffer.from(outcome.Signature).toString('hex'),
      signingKeyId: outcome.KeyId ?? this.keyId,
      publicKey,
      algorithm: this.algorithm,
    };
  }

  private publicKey(): Promise<string> {
    this.publicKeyPromise ??= this.client.send(new GetPublicKeyCommand({ KeyId: this.keyId })).then((outcome) => {
      if (!outcome.PublicKey) throw new Error('AWS KMS returned no checkpoint public key');
      return createPublicKey({ key: Buffer.from(outcome.PublicKey), format: 'der', type: 'spki' })
        .export({ type: 'spki', format: 'pem' }).toString();
    });
    return this.publicKeyPromise;
  }
}
