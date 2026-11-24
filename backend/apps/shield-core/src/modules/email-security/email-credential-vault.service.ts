import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { GcpKmsEnvelope } from '../../../../../libs/kms/src/gcp-kms-envelope';
import { PrismaService } from '../../prisma/prisma.service';

export type EmailCredentialPurpose =
  'OAUTH_REFRESH_TOKEN' | 'PKCE_VERIFIER' | 'PHASE2_WRITE';

interface KeyWrapper {
  keyRef: string;
  wrap(dataKey: Buffer): Promise<string>;
  unwrap(wrapped: string): Promise<Buffer>;
}

/**
 * Crown-jewel provider secret store (ZS-UX-EMTI-001 §20, ZS-ZM-ENG-003 SEC-02).
 *
 * - Each secret gets its own random AES-256-GCM data key; the data key is
 *   wrapped by Cloud KMS (`EMAIL_CREDENTIAL_KMS_KEY`) so the wrapping key never
 *   enters this process. Outside production a local dev key
 *   (`EMAIL_CREDENTIAL_DEV_KEY`, base64, 32 bytes) may be used instead.
 * - Production without KMS fails closed: no secret can be stored or read.
 * - Ciphertext is bound to tenant, purpose and provider via GCM AAD, and
 *   `reveal` rejects a secret that belongs to another tenant (T04).
 * - Revocation crypto-shreds: ciphertext and wrapped key are deleted (T16).
 * - Plaintext is never logged or returned by any API.
 */
@Injectable()
export class EmailCredentialVaultService {
  private readonly logger = new Logger(EmailCredentialVaultService.name);
  private wrapper: KeyWrapper | null | undefined;

  constructor(private readonly prisma: PrismaService) {}

  private resolveWrapper(): KeyWrapper {
    if (this.wrapper) return this.wrapper;
    const kmsKey = process.env.EMAIL_CREDENTIAL_KMS_KEY?.trim();
    if (kmsKey) {
      const envelope = new GcpKmsEnvelope(kmsKey);
      this.wrapper = {
        keyRef: `kms:${kmsKey}`,
        wrap: (k) => envelope.wrap(k),
        unwrap: (w) => envelope.unwrap(w),
      };
      return this.wrapper;
    }
    if (process.env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException(
        'CREDENTIAL_VAULT_NOT_CONFIGURED: EMAIL_CREDENTIAL_KMS_KEY is required in production',
      );
    }
    const devKeyB64 = process.env.EMAIL_CREDENTIAL_DEV_KEY?.trim();
    const devKey = devKeyB64 ? Buffer.from(devKeyB64, 'base64') : null;
    if (!devKey || devKey.length !== 32) {
      throw new ServiceUnavailableException(
        'CREDENTIAL_VAULT_NOT_CONFIGURED: set EMAIL_CREDENTIAL_KMS_KEY or a 32-byte base64 EMAIL_CREDENTIAL_DEV_KEY',
      );
    }
    this.wrapper = {
      keyRef: 'dev-local',
      wrap: (dataKey) => {
        const iv = randomBytes(12);
        const c = createCipheriv('aes-256-gcm', devKey, iv);
        const ct = Buffer.concat([c.update(dataKey), c.final()]);
        return Promise.resolve(
          [iv, c.getAuthTag(), ct].map((b) => b.toString('base64')).join('.'),
        );
      },
      unwrap: (wrapped) => {
        const [iv, tag, ct] = wrapped
          .split('.')
          .map((p) => Buffer.from(p, 'base64'));
        const d = createDecipheriv('aes-256-gcm', devKey, iv);
        d.setAuthTag(tag);
        return Promise.resolve(Buffer.concat([d.update(ct), d.final()]));
      },
    };
    return this.wrapper;
  }

  /** Throws when the vault cannot be used (so callers can fail before any side effect). */
  assertConfigured(): void {
    this.resolveWrapper();
  }

  private aad(tenantId: string, purpose: string, provider: string): Buffer {
    return Buffer.from(`${tenantId}|${purpose}|${provider}`, 'utf8');
  }

  async store(input: {
    tenantId: string;
    provider: string;
    purpose: EmailCredentialPurpose;
    plaintext: string;
    connectionId?: string | null;
    intentId?: string | null;
    expiresAt?: Date | null;
  }): Promise<string> {
    const wrapper = this.resolveWrapper();
    const dataKey = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', dataKey, iv);
    cipher.setAAD(this.aad(input.tenantId, input.purpose, input.provider));
    const ct = Buffer.concat([
      cipher.update(Buffer.from(input.plaintext, 'utf8')),
      cipher.final(),
    ]);
    const wrappedKey = await wrapper.wrap(dataKey);
    dataKey.fill(0);

    const row = await this.prisma.emailCredentialSecret.create({
      data: {
        tenant_id: input.tenantId,
        provider: input.provider,
        purpose: input.purpose,
        connection_id: input.connectionId ?? null,
        intent_id: input.intentId ?? null,
        ciphertext: ct.toString('base64'),
        iv: iv.toString('base64'),
        auth_tag: cipher.getAuthTag().toString('base64'),
        wrapped_key: wrappedKey,
        key_ref: wrapper.keyRef,
        expires_at: input.expiresAt ?? null,
      },
    });
    return row.id;
  }

  async reveal(
    tenantId: string,
    secretId: string,
    purpose: EmailCredentialPurpose,
  ): Promise<string> {
    // Looked up by id ONLY, then tenant-checked, so a cross-tenant reference
    // is rejected explicitly instead of silently "not found" (T04).
    const row = await this.prisma.emailCredentialSecret.findUnique({
      where: { id: secretId },
    });
    if (!row) {
      throw new NotFoundException('CREDENTIAL_NOT_FOUND');
    }
    if (row.tenant_id !== tenantId) {
      this.logger.warn(
        `Cross-tenant credential reference rejected (secret tenant != ${tenantId})`,
      );
      throw new ForbiddenException('CREDENTIAL_TENANT_MISMATCH');
    }
    if (row.purpose !== purpose) {
      throw new ForbiddenException('CREDENTIAL_PURPOSE_MISMATCH');
    }
    if (row.revoked_at || !row.ciphertext || !row.wrapped_key) {
      throw new ForbiddenException('CREDENTIAL_REVOKED');
    }
    if (row.expires_at && row.expires_at.getTime() <= Date.now()) {
      throw new ForbiddenException('CREDENTIAL_EXPIRED');
    }
    const wrapper = this.resolveWrapper();
    const dataKey = await wrapper.unwrap(row.wrapped_key);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      dataKey,
      Buffer.from(row.iv!, 'base64'),
    );
    decipher.setAAD(this.aad(row.tenant_id, row.purpose, row.provider));
    decipher.setAuthTag(Buffer.from(row.auth_tag!, 'base64'));
    const pt = Buffer.concat([
      decipher.update(Buffer.from(row.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    dataKey.fill(0);
    return pt;
  }

  async attachToConnection(
    tenantId: string,
    secretId: string,
    connectionId: string,
  ): Promise<void> {
    await this.prisma.emailCredentialSecret.updateMany({
      where: { id: secretId, tenant_id: tenantId },
      data: { connection_id: connectionId },
    });
  }

  /** Crypto-shred: delete ciphertext and wrapped key, keep a non-sensitive revocation record. */
  async revoke(
    tenantId: string,
    filter: { secretId?: string; connectionId?: string; intentId?: string },
  ): Promise<number> {
    const res = await this.prisma.emailCredentialSecret.updateMany({
      where: {
        tenant_id: tenantId,
        revoked_at: null,
        ...(filter.secretId ? { id: filter.secretId } : {}),
        ...(filter.connectionId ? { connection_id: filter.connectionId } : {}),
        ...(filter.intentId ? { intent_id: filter.intentId } : {}),
      },
      data: {
        revoked_at: new Date(),
        ciphertext: null,
        iv: null,
        auth_tag: null,
        wrapped_key: null,
      },
    });
    return res.count;
  }

  async hasActive(
    tenantId: string,
    purpose: EmailCredentialPurpose,
    provider?: string,
  ): Promise<boolean> {
    const count = await this.prisma.emailCredentialSecret.count({
      where: {
        tenant_id: tenantId,
        purpose,
        revoked_at: null,
        ...(provider ? { provider } : {}),
        OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
      },
    });
    return count > 0;
  }
}
