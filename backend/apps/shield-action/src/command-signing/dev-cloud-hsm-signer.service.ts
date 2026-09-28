import { Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { SignableCommand, SignedCommand } from './command-signer.interface';

/**
 * Development/test signer only, standing in for CloudHsmSignerService's KMS
 * custody. Construction refuses outright in production — there is no
 * environment-variable escape hatch — so a production deploy that has not
 * configured ACTION_HSM_COMMAND_KMS_KEY_VERSION fails at boot rather than
 * signing with a key that lives in process memory and disappears on restart.
 *
 * The key custody metadata is labeled for exactly what it is: an ephemeral
 * in-process key, never a Cloud HSM or FIPS-validated one.
 */
export class DevCloudHsmSignerService {
  private readonly logger = new Logger(DevCloudHsmSignerService.name);
  private readonly keyId: string;
  private readonly privateKeyPem: string;
  private readonly publicKeyPem: string;
  readonly algorithm = 'ECDSA_P256_SHA256';

  constructor() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'DevCloudHsmSignerService must never operate in production. Set ACTION_HSM_COMMAND_KMS_KEY_VERSION so the KMS-backed signer is used instead.',
      );
    }

    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    this.privateKeyPem = privateKey;
    this.publicKeyPem = publicKey;
    this.keyId = `dev-hsm-command-key-${crypto.randomUUID()}`;
    this.logger.warn(
      `DevCloudHsmSignerService generated an EPHEMERAL P-256 keypair (keyId=${this.keyId}) — development/test only. Commands signed with it cannot be verified after this process restarts.`,
    );
  }

  async getActiveKeyMetadata() {
    return {
      keyId: this.keyId,
      algorithm: this.algorithm,
      publicKeyPem: this.publicKeyPem,
      hsmEnclaveId: 'NONE_DEV_EPHEMERAL_KEY',
      fipsLevel: 'NOT_APPLICABLE_DEVELOPMENT_ONLY',
    };
  }

  async sign(
    command: SignableCommand,
    executionMode: 'SIMULATION' | 'LIVE' = 'LIVE',
  ): Promise<SignedCommand> {
    const canonicalMaterial = JSON.stringify({
      tenantId: command.tenantId,
      actionCommandId: command.actionCommandId,
      nonce: command.nonce,
      executionMode,
      payload: command.payload,
    });

    const signer = crypto.createSign('SHA256');
    signer.update(canonicalMaterial);
    signer.end();

    return {
      signature: `dev:${this.keyId}:${signer.sign(this.privateKeyPem, 'hex')}`,
      signedBy: `DevEphemeralKey:${this.keyId}`,
      signedAt: new Date().toISOString(),
    };
  }

  async verifySignature(
    command: SignableCommand,
    executionMode: 'SIMULATION' | 'LIVE',
    signatureString: string,
  ): Promise<boolean> {
    const parts = signatureString.split(':');
    if (parts.length !== 3 || parts[0] !== 'dev') return false;

    const canonicalMaterial = JSON.stringify({
      tenantId: command.tenantId,
      actionCommandId: command.actionCommandId,
      nonce: command.nonce,
      executionMode,
      payload: command.payload,
    });

    const verifier = crypto.createVerify('SHA256');
    verifier.update(canonicalMaterial);
    verifier.end();

    try {
      return verifier.verify(this.publicKeyPem, parts[2], 'hex');
    } catch {
      return false;
    }
  }
}
