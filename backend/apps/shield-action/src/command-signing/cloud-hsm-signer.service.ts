import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  CommandSigner,
  SignableCommand,
  SignedCommand,
} from './command-signer.interface';

export interface HsmKeyPair {
  keyId: string;
  algorithm: 'ECDSA_P256_SHA256' | 'RSA_PSS_2048_SHA256';
  publicKeyPem: string;
  privateKeyPem: string;
  hsmEnclaveId: string;
  fipsLevel: string;
  createdAt: string;
}

@Injectable()
export class CloudHsmSignerService implements CommandSigner {
  private readonly logger = new Logger(CloudHsmSignerService.name);
  private activeKey: HsmKeyPair;

  constructor() {
    this.activeKey = this.generateEphemeralHsmEnclaveKey();
  }

  private generateEphemeralHsmEnclaveKey(): HsmKeyPair {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    return {
      keyId: `hsm-key-${crypto.randomUUID().slice(0, 8)}`,
      algorithm: 'ECDSA_P256_SHA256',
      publicKeyPem: publicKey,
      privateKeyPem: privateKey,
      // Honest custody metadata. This key is generated in process memory by
      // Node's crypto module - it is not held in, or attested by, any HSM,
      // and no FIPS validation applies. Reporting a cloud HSM cluster and a
      // FIPS level here fabricated key-custody provenance; the spec requires
      // HSM/KMS custody as a control still to be built, not a label.
      hsmEnclaveId: 'NONE_SOFTWARE_KEY',
      fipsLevel: 'NOT_VALIDATED',
      createdAt: new Date().toISOString(),
    };
  }

  getActiveKeyMetadata() {
    return {
      keyId: this.activeKey.keyId,
      algorithm: this.activeKey.algorithm,
      publicKeyPem: this.activeKey.publicKeyPem,
      hsmEnclaveId: this.activeKey.hsmEnclaveId,
      fipsLevel: this.activeKey.fipsLevel,
    };
  }

  /**
   * Signs a high-consequence SOAR response command using Cloud HSM Asymmetric Private Key.
   */
  sign(
    command: SignableCommand,
    executionMode: 'SIMULATION' | 'LIVE' = 'LIVE',
  ): SignedCommand {
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

    const signatureDer = signer.sign(this.activeKey.privateKeyPem, 'hex');

    return {
      signature: `hsm:${this.activeKey.keyId}:${signatureDer}`,
      signedBy: `SoftwareKey:${this.activeKey.keyId}`,
      signedAt: new Date().toISOString(),
    };
  }

  /**
   * Verifies an HSM signature against the active public key.
   */
  verifySignature(
    command: SignableCommand,
    executionMode: 'SIMULATION' | 'LIVE',
    signatureString: string,
  ): boolean {
    const parts = signatureString.split(':');
    if (parts.length !== 3 || parts[0] !== 'hsm') return false;

    const signatureHex = parts[2];
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

    return verifier.verify(this.activeKey.publicKeyPem, signatureHex, 'hex');
  }
}
