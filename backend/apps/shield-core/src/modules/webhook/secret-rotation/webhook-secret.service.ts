import { Injectable, Logger } from '@nestjs/common';
import { randomBytes, randomUUID, createHash } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * The real secret belongs in vault only (spec §44) — outbound signing
 * needs it back in reversible form, so a one-way hash alone is not
 * sufficient. No real vault integration exists in this repo (same
 * standing gap as ENTRA_CLIENT_SECRET's vault-reference placeholder
 * pattern used elsewhere) — this DEV-ONLY store keeps the raw secret
 * in-process, keyed by the same secretRef persisted on WebhookSecretVersion,
 * and is explicitly not production vault-equivalent. It is never logged.
 */
@Injectable()
export class WebhookSecretService {
  private readonly logger = new Logger(WebhookSecretService.name);
  private readonly devVault = new Map<string, string>();

  constructor(private readonly prisma: PrismaService) {}

  async issue(tenantId: string, webhookSubscriptionId: string): Promise<{ version: number; secretRef: string }> {
    const latest = await this.prisma.webhookSecretVersion.findFirst({ where: { webhook_subscription_id: webhookSubscriptionId }, orderBy: { version: 'desc' } });
    const nextVersion = (latest?.version ?? 0) + 1;

    const rawSecret = randomBytes(32).toString('hex');
    const secretRef = `dev-vault:webhook-secret:${randomUUID()}`;
    const fingerprint = createHash('sha256').update(rawSecret).digest('hex').slice(0, 16);
    this.devVault.set(secretRef, rawSecret);

    if (latest) {
      await this.prisma.webhookSecretVersion.update({ where: { id: latest.id }, data: { status: 'RETIRING' } });
    }

    await this.prisma.webhookSecretVersion.create({
      data: { id: randomUUID(), tenant_id: tenantId, webhook_subscription_id: webhookSubscriptionId, version: nextVersion, secret_ref: secretRef, fingerprint, status: 'ACTIVE' },
    });

    this.logger.debug(`Issued webhook secret version ${nextVersion} for subscription ${webhookSubscriptionId} (dev vault ref, not logged)`);
    return { version: nextVersion, secretRef };
  }

  async resolve(secretRef: string): Promise<string | null> {
    return this.devVault.get(secretRef) ?? null;
  }

  async getActiveSecret(webhookSubscriptionId: string): Promise<string | null> {
    const active = await this.prisma.webhookSecretVersion.findFirst({ where: { webhook_subscription_id: webhookSubscriptionId, status: 'ACTIVE' }, orderBy: { version: 'desc' } });
    if (!active) return null;
    return this.resolve(active.secret_ref);
  }
}
