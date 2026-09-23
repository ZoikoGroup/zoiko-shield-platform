import { Logger } from '@nestjs/common';
import {
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  generateKeyPairSync,
  randomUUID,
} from 'crypto';
import {
  canonicalCommandPayload,
  type CommandSignResult,
  type CommandSigningPayload,
  type GovernedCommandSigner,
} from './command-signer.interface';

/**
 * Development/test signer only.
 *
 * Construction refuses outright in production — there is no
 * environment-variable escape hatch — so a production deploy that has not
 * configured KMS fails at boot rather than signing high-consequence response
 * commands with a key that lives in process memory and disappears on restart.
 *
 * The key it generates is ephemeral by design. Anything it signs is verifiable
 * only for the life of this process, which is the honest property of a
 * development key and the reason it must never reach production.
 */
export class DevGovernedCommandSigner implements GovernedCommandSigner {
  private readonly logger = new Logger(DevGovernedCommandSigner.name);
  private readonly keyId: string;
  private readonly privateKeyPem: string;
  private readonly publicKeyPem: string;
  readonly algorithm = 'ECDSA_SHA_256';

  constructor() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'DevGovernedCommandSigner must never operate in production. Set ACTION_COMMAND_KMS_KEY_ID so the KMS-backed signer is used instead.',
      );
    }

    const configuredKey = process.env.ACTION_COMMAND_DEV_PRIVATE_KEY?.trim();
    if (configuredKey) {
      const privateKey = createPrivateKey(configuredKey);
      this.privateKeyPem = privateKey
        .export({ type: 'pkcs8', format: 'pem' })
        .toString();
      this.publicKeyPem = createPublicKey(privateKey)
        .export({ type: 'spki', format: 'pem' })
        .toString();
      this.keyId = process.env.ACTION_COMMAND_DEV_KEY_ID?.trim() || 'dev-command-key-configured';
      this.logger.warn(
        `DevGovernedCommandSigner loaded a configured dev private key (keyId=${this.keyId}) — non-production only.`,
      );
    } else {
      const { publicKey, privateKey } = generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      this.privateKeyPem = privateKey;
      this.publicKeyPem = publicKey;
      this.keyId = `dev-command-key-${randomUUID()}`;
      this.logger.warn(
        `DevGovernedCommandSigner generated an EPHEMERAL P-256 keypair (keyId=${this.keyId}) — development/test only. Commands signed with it cannot be verified after this process restarts.`,
      );
    }
  }

  async sign(payload: CommandSigningPayload): Promise<CommandSignResult> {
    const signer = createSign('SHA256');
    signer.update(canonicalCommandPayload(payload));
    signer.end();
    return {
      signature: signer.sign(this.privateKeyPem, 'hex'),
      signingKeyId: this.keyId,
      publicKey: this.publicKeyPem,
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
      return verifier.verify(publicKey || this.publicKeyPem, signature, 'hex');
    } catch {
      // A malformed signature or key is a failed verification, not a crash.
      return false;
    }
  }

  async publicKey() {
    return {
      signingKeyId: this.keyId,
      publicKey: this.publicKeyPem,
      algorithm: this.algorithm,
    };
  }
}
