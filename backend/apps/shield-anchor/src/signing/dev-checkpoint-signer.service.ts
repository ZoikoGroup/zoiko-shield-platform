import { Injectable, Logger } from '@nestjs/common';
import { generateKeyPairSync, sign as edSign, createPrivateKey, createPublicKey, KeyObject } from 'crypto';
import { randomUUID } from 'crypto';
import { CheckpointSigner, CheckpointSignResult } from './checkpoint-signer.interface';

const ALGORITHM = 'Ed25519';

/**
 * Explicitly dev/test-only — NEVER operates in production, full stop
 * (spec correction #1). Not "throws if no key is configured": construction
 * itself refuses unconditionally when NODE_ENV === 'production', with no
 * environment-variable escape hatch. A KmsCheckpointSigner/HsmCheckpointSigner
 * backed by a controlled dedicated anchor identity is the required future
 * production implementation — not built this pass.
 */
@Injectable()
export class DevCheckpointSigner implements CheckpointSigner {
  private readonly logger = new Logger(DevCheckpointSigner.name);
  private readonly keyId: string;
  private readonly privateKey: KeyObject;
  private readonly publicKeyPem: string;

  constructor() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'DevCheckpointSigner must never operate in production. Configure a KmsCheckpointSigner/HsmCheckpointSigner backed by a controlled dedicated anchor identity instead.',
      );
    }

    this.keyId = `dev-key-${randomUUID()}`;
    if (process.env.ANCHOR_SIGNING_PRIVATE_KEY_PEM) {
      this.privateKey = createPrivateKey(process.env.ANCHOR_SIGNING_PRIVATE_KEY_PEM);
      this.publicKeyPem = createPublicKey(this.privateKey).export({ type: 'spki', format: 'pem' }).toString();
      this.logger.warn(`DevCheckpointSigner loaded a configured dev private key (keyId=${this.keyId}) — still non-production only.`);
    } else {
      const { privateKey, publicKey } = generateKeyPairSync('ed25519');
      this.privateKey = privateKey;
      this.publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
      this.logger.warn(`DevCheckpointSigner generated an EPHEMERAL Ed25519 keypair (keyId=${this.keyId}) — development/test only, not production signing authority.`);
    }
  }

  sign(merkleRoot: string): CheckpointSignResult {
    const signature = edSign(null, Buffer.from(merkleRoot, 'utf-8'), this.privateKey);
    return {
      signature: signature.toString('hex'),
      signingKeyId: this.keyId,
      publicKey: this.publicKeyPem,
      algorithm: ALGORITHM,
    };
  }
}
