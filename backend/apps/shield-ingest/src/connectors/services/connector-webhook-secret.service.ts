import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'crypto';
import { GcpKmsEnvelope } from '../../../../../libs/kms/src/gcp-kms-envelope';
import { runWithPlatformScope } from '../../../../../libs/database/src';
import { PrismaService } from '../../prisma/prisma.service';

/** How a signing secret is presented to the user. Shown once, never again. */
export interface IssuedWebhookSecret {
  secret: string;
  version: number;
  hint: string;
  createdAt: Date;
}

export interface WebhookSecretStatus {
  /** False for a connector that has no per-connector secret yet. */
  configured: boolean;
  version?: number;
  /** Last four characters, so people can tell which secret is active. */
  hint?: string;
  createdAt?: Date;
  /** True once the plaintext has been handed out; it cannot be shown again. */
  revealed?: boolean;
  /** Set while a previous secret is still accepted after a rotation. */
  previousValidUntil?: Date | null;
}

interface KeyWrapper {
  keyRef: string;
  wrap(dataKey: Buffer): Promise<string>;
  unwrap(wrapped: string): Promise<Buffer>;
}

const SECRET_PREFIX = 'whsec_';
const DEFAULT_GRACE_HOURS = 24;
/** Verified secrets are cached briefly so a KMS unwrap is not paid per webhook. */
const CACHE_TTL_MS = 15_000;

/**
 * Inbound webhook signing secrets, one per connector.
 *
 * Before this, every connector was verified against a single platform-wide
 * value from the environment, so revealing "the secret" to one tenant would
 * have let them sign events for every other tenant's connectors. Each
 * connector now has its own.
 *
 * - The secret must be recoverable (the guard recomputes the HMAC), so it is
 *   envelope-encrypted like the email credential vault: a random AES-256-GCM
 *   data key per secret, wrapped by Cloud KMS (`CONNECTOR_SECRET_KMS_KEY`).
 *   Outside production a local key (`CONNECTOR_SECRET_DEV_KEY`, 32 bytes,
 *   base64) may stand in. Production without KMS fails closed.
 * - Ciphertext is bound to tenant and connector through GCM AAD, so a row
 *   copied onto another connector will not decrypt.
 * - The plaintext leaves the service exactly once (`reveal`, or the response
 *   to `rotate`). It is never logged and no later call returns it.
 * - Rotation keeps the previous secret valid for a grace window so senders
 *   can be updated without dropping events, or ends it at once when a secret
 *   is believed compromised.
 */
@Injectable()
export class ConnectorWebhookSecretService {
  private readonly logger = new Logger(ConnectorWebhookSecretService.name);
  private wrapper: KeyWrapper | undefined;
  private readonly cache = new Map<
    string,
    { secrets: string[]; expires: number }
  >();

  constructor(private readonly prisma: PrismaService) {}

  // ---- key custody -------------------------------------------------------

  /** True when secrets can be stored here. Never throws. */
  isConfigured(): boolean {
    try {
      this.resolveWrapper();
      return true;
    } catch {
      return false;
    }
  }

  private resolveWrapper(): KeyWrapper {
    if (this.wrapper) return this.wrapper;
    const kmsKey = process.env.CONNECTOR_SECRET_KMS_KEY?.trim();
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
        'CONNECTOR_SECRET_VAULT_NOT_CONFIGURED: CONNECTOR_SECRET_KMS_KEY is required in production',
      );
    }
    const devKey = process.env.CONNECTOR_SECRET_DEV_KEY?.trim();
    const key = devKey ? Buffer.from(devKey, 'base64') : null;
    if (!key || key.length !== 32) {
      throw new ServiceUnavailableException(
        'CONNECTOR_SECRET_VAULT_NOT_CONFIGURED: set CONNECTOR_SECRET_KMS_KEY or a 32-byte base64 CONNECTOR_SECRET_DEV_KEY',
      );
    }
    this.wrapper = {
      keyRef: 'dev-local',
      wrap: (dataKey) => {
        const iv = randomBytes(12);
        const c = createCipheriv('aes-256-gcm', key, iv);
        const ct = Buffer.concat([c.update(dataKey), c.final()]);
        return Promise.resolve(
          [iv, c.getAuthTag(), ct].map((b) => b.toString('base64')).join('.'),
        );
      },
      unwrap: (wrapped) => {
        const [iv, tag, ct] = wrapped
          .split('.')
          .map((p) => Buffer.from(p, 'base64'));
        const d = createDecipheriv('aes-256-gcm', key, iv);
        d.setAuthTag(tag);
        return Promise.resolve(Buffer.concat([d.update(ct), d.final()]));
      },
    };
    return this.wrapper;
  }

  private aad(tenantId: string, instanceId: string, version: number): Buffer {
    return Buffer.from(
      `${tenantId}|${instanceId}|webhook-secret|v${version}`,
      'utf8',
    );
  }

  private async encrypt(
    tenantId: string,
    instanceId: string,
    version: number,
    plaintext: string,
  ) {
    const wrapper = this.resolveWrapper();
    const dataKey = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', dataKey, iv);
    cipher.setAAD(this.aad(tenantId, instanceId, version));
    const ct = Buffer.concat([
      cipher.update(Buffer.from(plaintext, 'utf8')),
      cipher.final(),
    ]);
    const wrappedKey = await wrapper.wrap(dataKey);
    dataKey.fill(0);
    return {
      ciphertext: ct.toString('base64'),
      iv: iv.toString('base64'),
      auth_tag: cipher.getAuthTag().toString('base64'),
      wrapped_key: wrappedKey,
      key_ref: wrapper.keyRef,
    };
  }

  private async decrypt(row: {
    tenant_id: string;
    instanceId: string;
    version: number;
    ciphertext: string;
    iv: string;
    auth_tag: string;
    wrapped_key: string;
  }): Promise<string> {
    const wrapper = this.resolveWrapper();
    const dataKey = await wrapper.unwrap(row.wrapped_key);
    try {
      const d = createDecipheriv(
        'aes-256-gcm',
        dataKey,
        Buffer.from(row.iv, 'base64'),
      );
      d.setAAD(this.aad(row.tenant_id, row.instanceId, row.version));
      d.setAuthTag(Buffer.from(row.auth_tag, 'base64'));
      return Buffer.concat([
        d.update(Buffer.from(row.ciphertext, 'base64')),
        d.final(),
      ]).toString('utf8');
    } finally {
      dataKey.fill(0);
    }
  }

  private generate(): string {
    return SECRET_PREFIX + randomBytes(32).toString('base64url');
  }

  private graceHours(): number {
    const raw = Number(process.env.WEBHOOK_SECRET_ROTATION_GRACE_HOURS);
    return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_GRACE_HOURS;
  }

  // ---- lifecycle ---------------------------------------------------------

  private async requireInstance(tenantId: string, instanceId: string) {
    const instance = await this.prisma.connectorInstance.findFirst({
      where: { id: instanceId, tenant_id: tenantId, deletedAt: null },
      select: { id: true, tenant_id: true },
    });
    if (!instance) throw new NotFoundException('Connector not found');
    return instance;
  }

  /**
   * Create the connector's first secret. The plaintext is NOT returned: it is
   * collected afterwards with `reveal`, so it never appears in a create
   * response (which is cached for idempotency) and can be shown only once.
   */
  async issue(tenantId: string, instanceId: string): Promise<void> {
    const existing = await this.prisma.connectorWebhookSecret.findFirst({
      where: { instanceId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (existing) return;
    const plaintext = this.generate();
    const version = 1;
    await this.prisma.connectorWebhookSecret.create({
      data: {
        tenant_id: tenantId,
        instanceId,
        version,
        status: 'ACTIVE',
        secret_hint: plaintext.slice(-4),
        ...(await this.encrypt(tenantId, instanceId, version, plaintext)),
      },
    });
    this.cache.delete(instanceId);
    this.logger.log(`Issued webhook secret v1 for connector ${instanceId}`);
  }

  async status(
    tenantId: string,
    instanceId: string,
  ): Promise<WebhookSecretStatus> {
    await this.requireInstance(tenantId, instanceId);
    const rows = await this.prisma.connectorWebhookSecret.findMany({
      where: { instanceId },
      orderBy: { version: 'desc' },
      take: 2,
    });
    const active = rows.find((r) => r.status === 'ACTIVE');
    if (!active) return { configured: false };
    const previous = rows.find(
      (r) =>
        r.status === 'ROTATED' && r.validUntil && r.validUntil > new Date(),
    );
    return {
      configured: true,
      version: active.version,
      hint: active.secret_hint,
      createdAt: active.createdAt,
      revealed: active.revealedAt !== null,
      previousValidUntil: previous?.validUntil ?? null,
    };
  }

  /**
   * Hand the current secret to the user, once. The claim is a single atomic
   * UPDATE, so two simultaneous calls cannot both receive it.
   */
  async reveal(
    tenantId: string,
    instanceId: string,
  ): Promise<IssuedWebhookSecret> {
    await this.requireInstance(tenantId, instanceId);
    const active = await this.prisma.connectorWebhookSecret.findFirst({
      where: { instanceId, status: 'ACTIVE', tenant_id: tenantId },
    });
    if (!active) {
      throw new NotFoundException(
        'This connector has no signing secret. Rotate to create one.',
      );
    }
    const claimed = await this.prisma.connectorWebhookSecret.updateMany({
      where: { id: active.id, revealedAt: null },
      data: { revealedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw new ConflictException(
        'This secret has already been shown. Rotate it to get a new one.',
      );
    }
    return {
      secret: await this.decrypt(active),
      version: active.version,
      hint: active.secret_hint,
      createdAt: active.createdAt,
    };
  }

  /**
   * Replace the secret. The new plaintext is returned here, once. The old
   * secret keeps verifying for the grace window unless `immediate` is set.
   */
  async rotate(
    tenantId: string,
    instanceId: string,
    options: { immediate?: boolean } = {},
  ): Promise<IssuedWebhookSecret & { previousValidUntil: Date | null }> {
    await this.requireInstance(tenantId, instanceId);
    const now = new Date();
    const plaintext = this.generate();

    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.connectorWebhookSecret.findFirst({
        where: { instanceId, status: 'ACTIVE', tenant_id: tenantId },
      });
      // Anything already rotated out is finished once a newer rotation starts.
      await tx.connectorWebhookSecret.updateMany({
        where: { instanceId, status: 'ROTATED' },
        data: { validUntil: now },
      });
      const previousValidUntil = current
        ? options.immediate
          ? now
          : new Date(now.getTime() + this.graceHours() * 3_600_000)
        : null;
      if (current) {
        await tx.connectorWebhookSecret.update({
          where: { id: current.id },
          data: { status: 'ROTATED', rotatedAt: now, validUntil: previousValidUntil },
        });
      }
      const version = (current?.version ?? 0) + 1;
      const created = await tx.connectorWebhookSecret.create({
        data: {
          tenant_id: tenantId,
          instanceId,
          version,
          status: 'ACTIVE',
          secret_hint: plaintext.slice(-4),
          revealedAt: now,
          ...(await this.encrypt(tenantId, instanceId, version, plaintext)),
        },
      });
      return { created, previousValidUntil };
    });

    this.cache.delete(instanceId);
    this.logger.log(
      `Rotated webhook secret for connector ${instanceId} to v${result.created.version}`,
    );
    return {
      secret: plaintext,
      version: result.created.version,
      hint: result.created.secret_hint,
      createdAt: result.created.createdAt,
      previousValidUntil: result.previousValidUntil,
    };
  }

  /** End every secret for a connector (it was retired). They cannot be restored. */
  async revokeAll(tenantId: string, instanceId: string): Promise<void> {
    await this.prisma.connectorWebhookSecret.updateMany({
      where: {
        instanceId,
        tenant_id: tenantId,
        status: { in: ['ACTIVE', 'ROTATED'] },
      },
      data: { status: 'REVOKED', validUntil: new Date() },
    });
    this.cache.delete(instanceId);
  }

  // ---- verification ------------------------------------------------------

  /**
   * Every secret that may currently sign for this connector: the active one
   * first, then a rotated-out one still inside its grace window. Empty when
   * the connector has none. Runs before a request has a tenant, so it reads
   * in platform scope, like the guard's own connector lookup.
   */
  async verificationSecrets(
    connectorId: string,
    options: { fresh?: boolean } = {},
  ): Promise<string[]> {
    if (!options.fresh) {
      const hit = this.cache.get(connectorId);
      if (hit && hit.expires > Date.now()) return hit.secrets;
    }
    const rows = await runWithPlatformScope(
      'webhook signature secret lookup',
      () =>
        this.prisma.connectorWebhookSecret.findMany({
          where: {
            instanceId: connectorId,
            OR: [
              { status: 'ACTIVE' },
              { status: 'ROTATED', validUntil: { gt: new Date() } },
            ],
          },
          orderBy: { version: 'desc' },
        }),
    );
    if (rows.length === 0) return [];
    if (!this.isConfigured()) {
      // A connector has secrets but this process cannot read them. Failing
      // open here would let the shared fallback secret verify it instead.
      throw new ServiceUnavailableException(
        'CONNECTOR_SECRET_VAULT_NOT_CONFIGURED',
      );
    }
    const secrets: string[] = [];
    for (const row of rows) {
      try {
        secrets.push(await this.decrypt(row));
      } catch {
        this.logger.error(
          `Webhook secret v${row.version} for connector ${connectorId} could not be decrypted`,
        );
      }
    }
    this.cache.set(connectorId, {
      secrets,
      expires: Date.now() + CACHE_TTL_MS,
    });
    return secrets;
  }
}
