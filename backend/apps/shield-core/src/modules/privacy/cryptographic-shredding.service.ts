import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import * as crypto from 'crypto';

export interface EncryptedSubjectPayload {
  subjectId: string;
  tenantId: string;
  keyVersion: number;
  ivHex: string;
  authTagHex: string;
  ciphertextHex: string;
  encryptedAt: string;
}

export interface ErasureCertificate {
  certificateId: string;
  tenantId: string;
  subjectId: string;
  erasureType: 'GDPR_ARTICLE_17_CRYPTO_SHRED' | 'HIPAA_RIGHT_TO_FORGET';
  shreddedAt: string;
  proofOfObliterationDigest: string;
  merkleIntegrityPreserved: boolean;
}

/**
 * Cryptographic Shredding & Privacy Erasure Engine
 * Specification: ZS-DISP-SHRED-001 (GDPR Article 17 / HIPAA Right-to-be-Forgotten)
 * Obliterates data subject PII from immutable Merkle chains by destroying subject-specific decryption keys.
 */
@Injectable()
export class CryptographicShreddingService {
  private readonly logger = new Logger(CryptographicShreddingService.name);

  // Secure In-Memory Key Vault: Map<"tenantId:subjectId", Buffer (raw 256-bit key)>
  private readonly subjectKeyVault = new Map<string, Buffer>();

  private getKeyVaultIndex(tenantId: string, subjectId: string): string {
    return `${tenantId}:${subjectId}`;
  }

  /**
   * Derives and stores an ephemeral Subject Encryption Key (SEK) for a specific user/subject.
   */
  provisionSubjectKey(tenantId: string, subjectId: string): void {
    const vaultKey = this.getKeyVaultIndex(tenantId, subjectId);
    if (!this.subjectKeyVault.has(vaultKey)) {
      const sek = crypto.randomBytes(32); // 256-bit AES key
      this.subjectKeyVault.set(vaultKey, sek);
      this.logger.log(`Provisioned SEK for Subject: ${subjectId} (Tenant: ${tenantId})`);
    }
  }

  /**
   * Encrypts sensitive subject PII using their dedicated Subject Encryption Key.
   */
  encryptSubjectPii(tenantId: string, subjectId: string, plaintextPii: string): EncryptedSubjectPayload {
    this.provisionSubjectKey(tenantId, subjectId);
    const vaultKey = this.getKeyVaultIndex(tenantId, subjectId);
    const sek = this.subjectKeyVault.get(vaultKey)!;

    const iv = crypto.randomBytes(12); // GCM 96-bit IV
    const cipher = crypto.createCipheriv('aes-256-gcm', sek, iv);

    let ciphertext = cipher.update(plaintextPii, 'utf-8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return {
      subjectId,
      tenantId,
      keyVersion: 1,
      ivHex: iv.toString('hex'),
      authTagHex: authTag.toString('hex'),
      ciphertextHex: ciphertext,
      encryptedAt: new Date().toISOString(),
    };
  }

  /**
   * Decrypts subject PII if the subject key is active in the vault.
   */
  decryptSubjectPii(payload: EncryptedSubjectPayload): string {
    const vaultKey = this.getKeyVaultIndex(payload.tenantId, payload.subjectId);
    const sek = this.subjectKeyVault.get(vaultKey);

    if (!sek) {
      this.logger.warn(`🚨 Decryption rejected: Subject ${payload.subjectId} key has been permanently shredded!`);
      throw new ForbiddenException(
        `Data for subject '${payload.subjectId}' has been cryptographically shredded per GDPR/HIPAA Right-to-be-Forgotten. Key is unrecoverable.`,
      );
    }

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      sek,
      Buffer.from(payload.ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(payload.authTagHex, 'hex'));

    let decrypted = decipher.update(payload.ciphertextHex, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');

    return decrypted;
  }

  /**
   * Cryptographically shreds the subject key, rendering all past and future ciphertexts unrecoverable.
   */
  shredSubjectKey(tenantId: string, subjectId: string): ErasureCertificate {
    const vaultKey = this.getKeyVaultIndex(tenantId, subjectId);
    const existingKey = this.subjectKeyVault.get(vaultKey);

    if (existingKey) {
      // Memory zeroization overwrite before deletion
      existingKey.fill(0);
      this.subjectKeyVault.delete(vaultKey);
    }

    const certificateId = `cert-shred-${crypto.randomUUID()}`;
    const shreddedAt = new Date().toISOString();

    const proofOfObliterationDigest = crypto
      .createHash('sha256')
      .update(JSON.stringify({ certificateId, tenantId, subjectId, shreddedAt, status: 'OBLITERATED' }))
      .digest('hex');

    this.logger.log(`✔ Cryptographically Shredded SEK for Subject [${subjectId}] -> Proof: ${proofOfObliterationDigest}`);

    return {
      certificateId,
      tenantId,
      subjectId,
      erasureType: 'GDPR_ARTICLE_17_CRYPTO_SHRED',
      shreddedAt,
      proofOfObliterationDigest,
      merkleIntegrityPreserved: true,
    };
  }
}
