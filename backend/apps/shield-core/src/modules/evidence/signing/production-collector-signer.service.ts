import { createPublicKey, createVerify } from 'crypto';
import {
  GetPublicKeyCommand,
  KMSClient,
  SignCommand,
  type SigningAlgorithmSpec,
} from '@aws-sdk/client-kms';
import type {
  CollectorSigner,
  CollectorSignResult,
  CollectorSigningPayload,
} from './collector-signer.interface';
import { canonicalCollectorPayload } from './collector-signer.interface';

const SUPPORTED_ALGORITHMS = new Set<SigningAlgorithmSpec>(['ECDSA_SHA_256']);

/**
 * Production collector signing through a non-exportable AWS KMS key, mirroring
 * the anchor checkpoint signer. Verification is done locally against the
 * exported public key rather than round-tripping to KMS: re-verifying stored
 * evidence must keep working even when KMS is unreachable.
 */
export class ProductionCollectorSigner implements CollectorSigner {
  private readonly keyId: string;
  private readonly algorithm: SigningAlgorithmSpec;
  private readonly client: KMSClient;
  private publicKeyPromise?: Promise<string>;

  constructor() {
    this.keyId = process.env.COLLECTOR_KMS_KEY_ID ?? '';
    this.algorithm = (process.env.COLLECTOR_KMS_SIGNING_ALGORITHM ??
      'ECDSA_SHA_256') as SigningAlgorithmSpec;
    if (!this.keyId) {
      throw new Error('COLLECTOR_KMS_KEY_ID is required in production');
    }
    if (!SUPPORTED_ALGORITHMS.has(this.algorithm)) {
      throw new Error(
        `Unsupported COLLECTOR_KMS_SIGNING_ALGORITHM '${this.algorithm}'`,
      );
    }
    this.client = new KMSClient({ region: process.env.AWS_REGION });
  }

  async sign(payload: CollectorSigningPayload): Promise<CollectorSignResult> {
    const message = Buffer.from(canonicalCollectorPayload(payload), 'utf-8');
    const [outcome, publicKey] = await Promise.all([
      this.client.send(
        new SignCommand({
          KeyId: this.keyId,
          Message: message,
          MessageType: 'RAW',
          SigningAlgorithm: this.algorithm,
        }),
      ),
      this.publicKey(),
    ]);
    if (!outcome.Signature) {
      throw new Error('AWS KMS returned no collector signature');
    }
    return {
      signature: Buffer.from(outcome.Signature).toString('hex'),
      signingKeyId: outcome.KeyId ?? this.keyId,
      publicKey,
      algorithm: this.algorithm,
    };
  }

  async verify(
    payload: CollectorSigningPayload,
    signature: string,
    publicKey: string,
  ): Promise<boolean> {
    try {
      const verifier = createVerify('SHA256');
      verifier.update(Buffer.from(canonicalCollectorPayload(payload), 'utf-8'));
      verifier.end();
      return verifier.verify(publicKey, Buffer.from(signature, 'hex'));
    } catch {
      return false;
    }
  }

  private publicKey(): Promise<string> {
    this.publicKeyPromise ??= this.client
      .send(new GetPublicKeyCommand({ KeyId: this.keyId }))
      .then((outcome) => {
        if (!outcome.PublicKey) {
          throw new Error('AWS KMS returned no collector public key');
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
