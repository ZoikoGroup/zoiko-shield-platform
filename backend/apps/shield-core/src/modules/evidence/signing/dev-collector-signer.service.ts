import { Injectable, Logger } from '@nestjs/common';
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
  sign as edSign,
  verify as edVerify,
  KeyObject,
} from 'crypto';
import {
  CollectorSigner,
  CollectorSignResult,
  CollectorSigningPayload,
  canonicalCollectorPayload,
} from './collector-signer.interface';

const ALGORITHM = 'Ed25519';

/**
 * Development/test signer only. Construction refuses outright in production
 * — there is no environment-variable escape hatch — so a production deploy
 * that forgets to wire the KMS signer fails at boot rather than quietly
 * signing evidence with an ephemeral key nobody can attest to.
 */
@Injectable()
export class DevCollectorSigner implements CollectorSigner {
  private readonly logger = new Logger(DevCollectorSigner.name);
  private readonly keyId: string;
  private readonly privateKey: KeyObject;
  private readonly publicKeyPem: string;

  constructor() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'DevCollectorSigner must never operate in production. Wire a KMS-backed collector signer instead.',
      );
    }

    this.keyId = `dev-collector-key-${randomUUID()}`;
    if (process.env.COLLECTOR_SIGNING_PRIVATE_KEY_PEM) {
      this.privateKey = createPrivateKey(
        process.env.COLLECTOR_SIGNING_PRIVATE_KEY_PEM,
      );
      this.publicKeyPem = createPublicKey(this.privateKey)
        .export({ type: 'spki', format: 'pem' })
        .toString();
      this.logger.warn(
        `DevCollectorSigner loaded a configured dev private key (keyId=${this.keyId}) — non-production only.`,
      );
    } else {
      const { privateKey, publicKey } = generateKeyPairSync('ed25519');
      this.privateKey = privateKey;
      this.publicKeyPem = publicKey
        .export({ type: 'spki', format: 'pem' })
        .toString();
      this.logger.warn(
        `DevCollectorSigner generated an EPHEMERAL Ed25519 keypair (keyId=${this.keyId}) — development/test only.`,
      );
    }
  }

  async sign(payload: CollectorSigningPayload): Promise<CollectorSignResult> {
    const signature = edSign(
      null,
      Buffer.from(canonicalCollectorPayload(payload), 'utf-8'),
      this.privateKey,
    );
    return {
      signature: signature.toString('hex'),
      signingKeyId: this.keyId,
      publicKey: this.publicKeyPem,
      algorithm: ALGORITHM,
    };
  }

  async verify(
    payload: CollectorSigningPayload,
    signature: string,
    publicKey: string,
  ): Promise<boolean> {
    try {
      return edVerify(
        null,
        Buffer.from(canonicalCollectorPayload(payload), 'utf-8'),
        createPublicKey(publicKey),
        Buffer.from(signature, 'hex'),
      );
    } catch {
      // A malformed signature or key is a failed verification, not a crash —
      // the caller needs a verdict it can record on the evidence record.
      return false;
    }
  }
}
