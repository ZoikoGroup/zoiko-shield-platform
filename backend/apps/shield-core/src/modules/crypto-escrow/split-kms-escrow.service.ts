import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface SplitKmsConfig {
  awsKmsKeyArn: string;
  azureKeyVaultUri: string;
  gcpKmsKeyName: string;
}

export interface SplitWrappedKeyPackage {
  keyId: string;
  tenantId: string;
  purpose: string;
  shares: Array<{
    provider: 'AWS_KMS' | 'AZURE_KEY_VAULT' | 'GCP_KMS';
    keyResourceIdentifier: string;
    encryptedShareHex: string;
    ivHex: string;
    authTagHex: string;
  }>;
  splitScheme: '3_OF_3_XOR_SECRET_SHARING';
  attestationDigest: string;
  createdEpochMs: number;
}

/**
 * Cross-Cloud Sovereign Key Escrow & Split KMS Wrapping Engine
 * Specification: ZS-SEC-KEY-001 §11 (Multi-Cloud Sovereign Cryptographic Escrow)
 */
@Injectable()
export class SplitKmsEscrowService {
  private readonly logger = new Logger(SplitKmsEscrowService.name);

  // Mock Root Keys for Simulated Cloud KMS Providers (256-bit keys)
  private readonly awsKmsRootKey = crypto
    .createHash('sha256')
    .update('AWS_HSM_ROOT_KEY_MATERIAL')
    .digest();
  private readonly azureKmsRootKey = crypto
    .createHash('sha256')
    .update('AZURE_HSM_ROOT_KEY_MATERIAL')
    .digest();
  private readonly gcpKmsRootKey = crypto
    .createHash('sha256')
    .update('GCP_HSM_ROOT_KEY_MATERIAL')
    .digest();

  /**
   * Generates a 256-bit master data key, splits it across 3 cloud KMS providers, and wraps each share.
   */
  generateAndWrapSplitMasterKey(
    tenantId: string,
    purpose: string,
    config: SplitKmsConfig,
  ): { masterKeyHex: string; wrappedPackage: SplitWrappedKeyPackage } {
    const keyId = `escrow-key-${crypto.randomUUID()}`;
    const masterKey = crypto.randomBytes(32); // 256-bit AES-GCM master key

    // 1. Split master key into 3 XOR shares: masterKey = share1 ^ share2 ^ share3
    const share1 = crypto.randomBytes(32);
    const share2 = crypto.randomBytes(32);
    const share3 = Buffer.alloc(32);
    for (let i = 0; i < 32; i++) {
      share3[i] = masterKey[i] ^ share1[i] ^ share2[i];
    }

    // 2. Wrap each share with independent Cloud KMS provider root keys using AES-256-GCM
    const wrappedShare1 = this.encryptShare(share1, this.awsKmsRootKey);
    const wrappedShare2 = this.encryptShare(share2, this.azureKmsRootKey);
    const wrappedShare3 = this.encryptShare(share3, this.gcpKmsRootKey);

    const shares = [
      {
        provider: 'AWS_KMS' as const,
        keyResourceIdentifier: config.awsKmsKeyArn,
        encryptedShareHex: wrappedShare1.ciphertextHex,
        ivHex: wrappedShare1.ivHex,
        authTagHex: wrappedShare1.authTagHex,
      },
      {
        provider: 'AZURE_KEY_VAULT' as const,
        keyResourceIdentifier: config.azureKeyVaultUri,
        encryptedShareHex: wrappedShare2.ciphertextHex,
        ivHex: wrappedShare2.ivHex,
        authTagHex: wrappedShare2.authTagHex,
      },
      {
        provider: 'GCP_KMS' as const,
        keyResourceIdentifier: config.gcpKmsKeyName,
        encryptedShareHex: wrappedShare3.ciphertextHex,
        ivHex: wrappedShare3.ivHex,
        authTagHex: wrappedShare3.authTagHex,
      },
    ];

    const createdEpochMs = Date.now();
    const attestationDigest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({ keyId, tenantId, purpose, shares, createdEpochMs }),
      )
      .digest('hex');

    this.logger.log(
      `✔ Generated Multi-Cloud Split KMS Escrow Key [${keyId}] for Tenant '${tenantId}' (Wrapped across AWS, Azure, GCP)`,
    );

    return {
      masterKeyHex: masterKey.toString('hex'),
      wrappedPackage: {
        keyId,
        tenantId,
        purpose,
        shares,
        splitScheme: '3_OF_3_XOR_SECRET_SHARING',
        attestationDigest,
        createdEpochMs,
      },
    };
  }

  /**
   * Reconstructs the 256-bit master key by unwrapping all 3 cloud KMS shares.
   */
  unwrapAndReconstructMasterKey(
    wrappedPackage: SplitWrappedKeyPackage,
  ): string {
    const awsShareMeta = wrappedPackage.shares.find(
      (s) => s.provider === 'AWS_KMS',
    );
    const azureShareMeta = wrappedPackage.shares.find(
      (s) => s.provider === 'AZURE_KEY_VAULT',
    );
    const gcpShareMeta = wrappedPackage.shares.find(
      (s) => s.provider === 'GCP_KMS',
    );

    if (!awsShareMeta || !azureShareMeta || !gcpShareMeta) {
      throw new Error(
        'Incomplete multi-cloud key shares: All 3 cloud providers required for reconstruction',
      );
    }

    const share1 = this.decryptShare(awsShareMeta, this.awsKmsRootKey);
    const share2 = this.decryptShare(azureShareMeta, this.azureKmsRootKey);
    const share3 = this.decryptShare(gcpShareMeta, this.gcpKmsRootKey);

    const reconstructedMasterKey = Buffer.alloc(32);
    for (let i = 0; i < 32; i++) {
      reconstructedMasterKey[i] = share1[i] ^ share2[i] ^ share3[i];
    }

    this.logger.log(
      `✔ Reconstructed Master Key for Key [${wrappedPackage.keyId}] from Multi-Cloud Escrow Shares`,
    );
    return reconstructedMasterKey.toString('hex');
  }

  private encryptShare(share: Buffer, rootKey: Buffer) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', rootKey, iv);
    const ciphertext = Buffer.concat([cipher.update(share), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
      ciphertextHex: ciphertext.toString('hex'),
      ivHex: iv.toString('hex'),
      authTagHex: authTag.toString('hex'),
    };
  }

  private decryptShare(
    meta: { encryptedShareHex: string; ivHex: string; authTagHex: string },
    rootKey: Buffer,
  ): Buffer {
    const iv = Buffer.from(meta.ivHex, 'hex');
    const authTag = Buffer.from(meta.authTagHex, 'hex');
    const ciphertext = Buffer.from(meta.encryptedShareHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', rootKey, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}
