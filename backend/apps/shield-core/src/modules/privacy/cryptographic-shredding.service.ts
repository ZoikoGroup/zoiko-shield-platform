import {
  ForbiddenException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import * as crypto from 'crypto';
import {
  DecryptCommand,
  GenerateDataKeyCommand,
  KMSClient,
} from '@aws-sdk/client-kms';
import { PrismaService } from '../../prisma/prisma.service';

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
  keyExisted: boolean;
}

interface WrappedSubjectKey {
  wrappedKey: string;
  wrappingKeyRef: string;
  keyVersion: number;
  status: string;
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
  private readonly shreddedSubjects = new Set<string>();
  private readonly wrappingKey: Buffer;
  private readonly wrappingKeyRef: string;
  private readonly kmsClient?: KMSClient;
  private readonly kmsKeyId?: string;

  constructor(@Optional() private readonly prisma?: PrismaService) {
    const configuredKey = process.env.SUBJECT_KEY_WRAPPING_SECRET;
    this.kmsKeyId = process.env.SUBJECT_KEY_KMS_KEY_ID;
    if (this.kmsKeyId) {
      this.kmsClient = new KMSClient({ region: process.env.AWS_REGION });
      this.wrappingKeyRef = `aws-kms:${this.kmsKeyId}`;
      this.wrappingKey = Buffer.alloc(0);
    } else {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          'SUBJECT_KEY_KMS_KEY_ID must be configured in production',
        );
      }
      if (!configuredKey) {
        throw new Error(
          'SUBJECT_KEY_WRAPPING_SECRET must be configured outside production',
        );
      }
      this.wrappingKey = crypto
        .createHash('sha256')
        .update(configuredKey)
        .digest();
      this.wrappingKeyRef =
        process.env.SUBJECT_KEY_WRAPPING_KEY_REF ||
        'env:SUBJECT_KEY_WRAPPING_SECRET';
    }
  }

  private getKeyVaultIndex(tenantId: string, subjectId: string): string {
    return `${tenantId}:${subjectId}`;
  }

  /**
   * Derives and stores an ephemeral Subject Encryption Key (SEK) for a specific user/subject.
   */
  private wrapKey(key: Buffer): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.wrappingKey, iv);
    const ciphertext = Buffer.concat([cipher.update(key), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
      'base64',
    );
  }

  private unwrapKey(wrappedKey: string): Buffer {
    const data = Buffer.from(wrappedKey, 'base64');
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.wrappingKey,
      data.subarray(0, 12),
    );
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([
      decipher.update(data.subarray(28)),
      decipher.final(),
    ]);
  }

  private async generateWrappedKey(): Promise<string> {
    if (this.kmsClient && this.kmsKeyId) {
      const result = await this.kmsClient.send(
        new GenerateDataKeyCommand({
          KeyId: this.kmsKeyId,
          KeySpec: 'AES_256',
        }),
      );
      if (!result.CiphertextBlob)
        throw new Error('KMS returned no wrapped subject key');
      return Buffer.from(result.CiphertextBlob).toString('base64');
    }
    return this.wrapKey(crypto.randomBytes(32));
  }

  private async unwrapStoredKey(wrappedKey: string): Promise<Buffer> {
    if (this.kmsClient) {
      const result = await this.kmsClient.send(
        new DecryptCommand({
          CiphertextBlob: Buffer.from(wrappedKey, 'base64'),
        }),
      );
      if (!result.Plaintext)
        throw new Error('KMS returned no subject key plaintext');
      return Buffer.from(result.Plaintext);
    }
    return this.unwrapKey(wrappedKey);
  }

  private async loadKey(
    tenantId: string,
    subjectId: string,
  ): Promise<Buffer | undefined> {
    const vaultKey = this.getKeyVaultIndex(tenantId, subjectId);
    if (this.prisma) {
      const record = await this.prisma.subjectEncryptionKey.findFirst({
        where: { tenant_id: tenantId, subject_id: subjectId, status: 'ACTIVE' },
        orderBy: { key_version: 'desc' },
      });
      if (!record) return undefined;
      return this.unwrapStoredKey(record.wrapped_key);
    }
    return this.subjectKeyVault.get(vaultKey);
  }

  async provisionSubjectKey(
    tenantId: string,
    subjectId: string,
  ): Promise<void> {
    const vaultKey = this.getKeyVaultIndex(tenantId, subjectId);
    if (
      this.shreddedSubjects.has(vaultKey) ||
      (this.prisma &&
        (await this.loadKey(tenantId, subjectId)) === undefined &&
        (await this.prisma.subjectEncryptionKey.findFirst({
          where: {
            tenant_id: tenantId,
            subject_id: subjectId,
            status: 'SHREDDED',
          },
        })))
    ) {
      throw new ForbiddenException(
        `Subject '${subjectId}' has been cryptographically shredded and cannot be re-encrypted in this key domain.`,
      );
    }

    if (await this.loadKey(tenantId, subjectId)) return;

    if (this.prisma) {
      await this.prisma.subjectEncryptionKey.create({
        data: {
          tenant_id: tenantId,
          subject_id: subjectId,
          wrapped_key: await this.generateWrappedKey(),
          wrapping_key_ref: this.wrappingKeyRef,
        },
      });
    } else if (!this.subjectKeyVault.has(vaultKey)) {
      const sek = crypto.randomBytes(32); // 256-bit AES key
      this.subjectKeyVault.set(vaultKey, sek);
      this.logger.log(
        `Provisioned SEK for Subject: ${subjectId} (Tenant: ${tenantId})`,
      );
    }
  }

  /**
   * Encrypts sensitive subject PII using their dedicated Subject Encryption Key.
   */
  async encryptSubjectPii(
    tenantId: string,
    subjectId: string,
    plaintextPii: string,
  ): Promise<EncryptedSubjectPayload> {
    await this.provisionSubjectKey(tenantId, subjectId);
    const sek = await this.loadKey(tenantId, subjectId);
    if (!sek)
      throw new ForbiddenException('Subject encryption key is unavailable');

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
  async decryptSubjectPii(payload: EncryptedSubjectPayload): Promise<string> {
    const sek = await this.loadKey(payload.tenantId, payload.subjectId);

    if (!sek) {
      this.logger.warn(
        `🚨 Decryption rejected: Subject ${payload.subjectId} key has been permanently shredded!`,
      );
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
  async shredSubjectKey(
    tenantId: string,
    subjectId: string,
  ): Promise<ErasureCertificate> {
    const vaultKey = this.getKeyVaultIndex(tenantId, subjectId);
    const existingKey = await this.loadKey(tenantId, subjectId);
    const keyExisted = Boolean(existingKey);

    if (existingKey) {
      // Memory zeroization overwrite before deletion
      existingKey.fill(0);
      this.subjectKeyVault.delete(vaultKey);
    }
    if (this.prisma) {
      await this.prisma.subjectEncryptionKey.updateMany({
        where: { tenant_id: tenantId, subject_id: subjectId, status: 'ACTIVE' },
        data: {
          status: 'SHREDDED',
          shredded_at: new Date(),
          wrapped_key: 'SHREDDED',
        },
      });
    }
    this.shreddedSubjects.add(vaultKey);

    const certificateId = `cert-shred-${crypto.randomUUID()}`;
    const shreddedAt = new Date().toISOString();

    const proofOfObliterationDigest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          certificateId,
          tenantId,
          subjectId,
          shreddedAt,
          status: 'OBLITERATED',
        }),
      )
      .digest('hex');

    this.logger.log(
      `✔ Cryptographically Shredded SEK for Subject [${subjectId}] -> Proof: ${proofOfObliterationDigest}`,
    );

    return {
      certificateId,
      tenantId,
      subjectId,
      erasureType: 'GDPR_ARTICLE_17_CRYPTO_SHRED',
      shreddedAt,
      proofOfObliterationDigest,
      merkleIntegrityPreserved: true,
      keyExisted,
    };
  }
}
