import { Injectable, Logger } from '@nestjs/common';
import { GcpKmsSigner } from '../../../../libs/kms/src/gcp-kms-signer';
import { SignableCommand, SignedCommand } from './command-signer.interface';

/**
 * Signs high-consequence SOAR response commands through a non-exportable
 * Google Cloud KMS key, mirroring ProductionGovernedCommandSigner. The
 * private key never enters this process.
 *
 * Custody labels are reported honestly: this uses a software-protection-level
 * KMS key (real non-exportable custody, real asymmetric signing), not an
 * HSM-protection-level key. Provisioning an HSM-tier key ring is a separate,
 * explicitly deferred piece of work — this service must never claim FIPS
 * validation or hardware custody it doesn't have. It previously generated
 * an ephemeral in-process software keypair and labeled it 'Cloud HSM cluster',
 * which was fabricated key-custody provenance; that has been replaced with
 * this real KMS-backed signer.
 */
@Injectable()
export class CloudHsmSignerService {
  private readonly logger = new Logger(CloudHsmSignerService.name);
  private readonly signer: GcpKmsSigner;

  constructor() {
    const keyVersion = process.env.ACTION_HSM_COMMAND_KMS_KEY_VERSION ?? '';
    if (!keyVersion) {
      throw new Error(
        'ACTION_HSM_COMMAND_KMS_KEY_VERSION is required — commands must be signed by a key in KMS custody, not one generated in process memory.',
      );
    }
    this.signer = new GcpKmsSigner(keyVersion);
  }

  async getActiveKeyMetadata() {
    return {
      keyId: this.signer.keyId,
      algorithm: this.signer.algorithm,
      publicKeyPem: await this.signer.publicKey(),
      // Honest custody metadata: this key is held in Google Cloud KMS at the
      // software protection level — a real non-exportable key, but not an
      // HSM-backed one, and no FIPS validation applies at this tier.
      hsmEnclaveId: 'GCP_KMS_SOFTWARE_PROTECTED',
      fipsLevel: 'NOT_APPLICABLE_SOFTWARE_PROTECTION_LEVEL',
    };
  }

  /**
   * Signs a high-consequence SOAR response command using the Cloud KMS key.
   */
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

    const signature = await this.signer.sign(canonicalMaterial);

    return {
      signature: `gcpkms:${this.signer.keyId}:${signature}`,
      signedBy: `GcpKms:${this.signer.keyId}`,
      signedAt: new Date().toISOString(),
    };
  }

  /**
   * Verifies a Cloud KMS signature against the key's public key.
   */
  async verifySignature(
    command: SignableCommand,
    executionMode: 'SIMULATION' | 'LIVE',
    signatureString: string,
  ): Promise<boolean> {
    const parts = signatureString.split(':');
    if (parts.length !== 3 || parts[0] !== 'gcpkms') return false;

    const signatureHex = parts[2];
    const canonicalMaterial = JSON.stringify({
      tenantId: command.tenantId,
      actionCommandId: command.actionCommandId,
      nonce: command.nonce,
      executionMode,
      payload: command.payload,
    });

    return this.signer.verify(canonicalMaterial, signatureHex);
  }
}
