import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ConnectorWebhookSecretService } from '../../connectors/services/connector-webhook-secret.service';
import {
  bindRequestTenant,
  runWithPlatformScope,
} from '../../../../../libs/database/src';

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly webhookSecrets?: ConnectorWebhookSecretService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const headers = request.headers;
    const connectorId = request.params?.connectorId;

    if (!request.rawBody) {
      throw new UnauthorizedException(
        'Raw request bytes are required for signature verification',
      );
    }
    const rawBody = request.rawBody.toString('utf-8');

    let secrets = await this.resolveSecrets(connectorId);
    if (secrets.length === 0) {
      throw new UnauthorizedException(
        'No signing secret is configured for this connector',
      );
    }

    // A genuine GitHub delivery carries X-GitHub-Delivery (a per-delivery UUID)
    // alongside X-Hub-Signature-256, and never carries our own nonce/timestamp
    // headers - GitHub's signing scheme has no room for them. Anything else
    // presenting x-hub-signature-256 without a delivery id is treated as our
    // own internal scheme below, unchanged.
    const githubDeliveryId = headers['x-github-delivery'] as string | undefined;
    const githubSignature = headers['x-hub-signature-256'] as
      string | undefined;
    const isGithub = Boolean(githubDeliveryId && githubSignature);

    const check = (candidates: string[]) =>
      isGithub
        ? this.githubSignatureMatches(rawBody, githubSignature!, candidates)
        : this.internalSignatureMatches(rawBody, headers, candidates);

    let valid = check(secrets);
    if (!valid && this.webhookSecrets) {
      // Secrets are cached briefly. If this process just rotated or another
      // instance did, look again before turning a legitimate sender away.
      const fresh = await this.resolveSecrets(connectorId, true);
      if (fresh.join('\u0000') !== secrets.join('\u0000')) {
        secrets = fresh;
        valid = check(secrets);
      }
    }
    if (!valid) {
      throw new UnauthorizedException(
        isGithub
          ? 'Invalid GitHub webhook HMAC signature'
          : 'Invalid webhook HMAC signature',
      );
    }

    if (isGithub) {
      await this.consumeReplayNonce(
        connectorId,
        githubDeliveryId!,
        new Date(Date.now() + 24 * 60 * 60 * 1000),
      );
    } else {
      const nonce = headers['x-webhook-nonce'] as string;
      const requestTime = Number(this.timestampOf(headers));
      await this.consumeReplayNonce(
        connectorId,
        nonce,
        new Date((requestTime + 300) * 1000),
        crypto.createHash('sha256').update(nonce).digest('hex'),
      );
    }
    await this.bindConnectorTenant(connectorId);
    return true;
  }

  /**
   * The delivery is now proven to come from the holder of this connector's
   * secret: scope the rest of the request to the connector's tenant. The
   * connector is located across tenants because nothing else names one.
   */
  private async bindConnectorTenant(connectorId: string): Promise<void> {
    const instance = await runWithPlatformScope(
      'signed webhook connector tenant lookup',
      () =>
        this.prisma.connectorInstance.findFirst({
          where: { id: connectorId },
          select: { tenant_id: true },
        }),
    );
    if (instance) bindRequestTenant(instance.tenant_id);
  }

  /**
   * Every secret that may sign for this connector, best first:
   *  1. the connector's own secrets (active, and a rotated one still inside
   *     its grace window);
   *  2. an operator-supplied entry in WEBHOOK_HMAC_SECRETS;
   *  3. outside production only, the shared WEBHOOK_HMAC_SECRET, which the
   *     Next proxy uses to sign for a signed-in browser session.
   */
  private async resolveSecrets(
    connectorId: string,
    fresh = false,
  ): Promise<string[]> {
    // Copied: the service hands back its cached array, which must not grow.
    const secrets: string[] = this.webhookSecrets
      ? [
          ...(await this.webhookSecrets.verificationSecrets(connectorId, {
            fresh,
          })),
        ]
      : [];
    const secretMap = process.env.WEBHOOK_HMAC_SECRETS
      ? (JSON.parse(process.env.WEBHOOK_HMAC_SECRETS) as Record<string, string>)
      : {};
    if (secretMap[connectorId]) secrets.push(secretMap[connectorId]);
    if (process.env.NODE_ENV !== 'production' && process.env.WEBHOOK_HMAC_SECRET) {
      secrets.push(process.env.WEBHOOK_HMAC_SECRET);
    }
    return [...new Set(secrets)];
  }

  private safeEqual(provided: string, expected: string): boolean {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  /**
   * GitHub's documented webhook signing scheme: X-Hub-Signature-256 is
   * `sha256=` + HMAC-SHA256(secret, rawBody) hex, computed over the raw body
   * alone. Replay protection keys off X-GitHub-Delivery (unique per delivery,
   * including redeliveries) since GitHub provides no timestamp to bound.
   */
  private githubSignatureMatches(
    rawBody: string,
    signature: string,
    secrets: string[],
  ): boolean {
    return secrets.some((secret) =>
      this.safeEqual(
        signature,
        `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`,
      ),
    );
  }

  private timestampOf(headers: Record<string, unknown>): string | undefined {
    return (
      (headers['x-timestamp'] as string) ||
      (headers['x-webhook-timestamp'] as string) ||
      (headers['x-request-timestamp'] as string)
    );
  }

  /**
   * Our own scheme: signature over `${timestamp}.${nonce}.${rawBody}`. The
   * presence, freshness and shape of the headers are validated first (and
   * throw their own errors); only the signature itself is a yes/no answer.
   */
  private internalSignatureMatches(
    rawBody: string,
    headers: Record<string, unknown>,
    secrets: string[],
  ): boolean {
    const signature =
      (headers['x-hub-signature-256'] as string) ||
      (headers['x-webhook-signature'] as string) ||
      (headers['x-signature-sha256'] as string) ||
      (headers['x-signature'] as string);

    if (!signature) {
      throw new UnauthorizedException(
        'Missing required webhook HMAC signature header (x-webhook-signature, x-signature, or x-hub-signature-256)',
      );
    }

    const timestampStr = this.timestampOf(headers);
    const nonce = headers['x-webhook-nonce'] as string;
    if (!timestampStr || !nonce) {
      throw new UnauthorizedException(
        'Webhook timestamp and nonce are required',
      );
    }
    const requestTime = Number(timestampStr);
    const currentTime = Math.floor(Date.now() / 1000);
    if (
      !Number.isInteger(requestTime) ||
      Math.abs(currentTime - requestTime) > 300
    ) {
      throw new UnauthorizedException(
        'Webhook request timestamp expired or invalid',
      );
    }

    const prefixed = signature.startsWith('sha256=');
    return secrets.some((secret) => {
      const hash = crypto
        .createHmac('sha256', secret)
        .update(`${timestampStr}.${nonce}.${rawBody}`)
        .digest('hex');
      return this.safeEqual(signature, prefixed ? `sha256=${hash}` : hash);
    });
  }

  private async consumeReplayNonce(
    connectorId: string,
    rawNonce: string,
    expiresAt: Date,
    precomputedHash?: string,
  ): Promise<void> {
    const nonceHash =
      precomputedHash ??
      crypto.createHash('sha256').update(rawNonce).digest('hex');

    await this.prisma.webhookReplayNonce.deleteMany({
      where: { expires_at: { lt: new Date() } },
    });
    try {
      await this.prisma.webhookReplayNonce.create({
        data: {
          connector_id: connectorId,
          nonce_hash: nonceHash,
          expires_at: expiresAt,
        },
      });
    } catch {
      throw new UnauthorizedException(
        'Webhook delivery has already been processed',
      );
    }
  }
}
