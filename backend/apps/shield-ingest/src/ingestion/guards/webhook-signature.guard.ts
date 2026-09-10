import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

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

    const secret = this.resolveSecret(connectorId);
    if (!secret) {
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
    const githubSignature = headers['x-hub-signature-256'] as string | undefined;
    if (githubDeliveryId && githubSignature) {
      return this.verifyGithubDelivery(
        connectorId,
        rawBody,
        githubSignature,
        githubDeliveryId,
        secret,
      );
    }

    return this.verifyInternalDelivery(connectorId, rawBody, headers, secret);
  }

  private resolveSecret(connectorId: string): string | undefined {
    const secretMap = process.env.WEBHOOK_HMAC_SECRETS
      ? (JSON.parse(process.env.WEBHOOK_HMAC_SECRETS) as Record<string, string>)
      : {};
    return (
      secretMap[connectorId] ??
      (process.env.NODE_ENV !== 'production'
        ? process.env.WEBHOOK_HMAC_SECRET
        : undefined)
    );
  }

  /**
   * GitHub's documented webhook signing scheme: X-Hub-Signature-256 is
   * `sha256=` + HMAC-SHA256(secret, rawBody) hex, computed over the raw body
   * alone. Replay protection keys off X-GitHub-Delivery (unique per delivery,
   * including redeliveries) since GitHub provides no timestamp to bound.
   */
  private async verifyGithubDelivery(
    connectorId: string,
    rawBody: string,
    signature: string,
    deliveryId: string,
    secret: string,
  ): Promise<boolean> {
    const computedHash = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    const expectedSignature = `sha256=${computedHash}`;

    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (
      sigBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Invalid GitHub webhook HMAC signature');
    }

    await this.consumeReplayNonce(
      connectorId,
      deliveryId,
      new Date(Date.now() + 24 * 60 * 60 * 1000),
    );
    return true;
  }

  /** Our own scheme: signature over `${timestamp}.${nonce}.${rawBody}`. */
  private async verifyInternalDelivery(
    connectorId: string,
    rawBody: string,
    headers: Record<string, unknown>,
    secret: string,
  ): Promise<boolean> {
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

    const timestampStr =
      (headers['x-timestamp'] as string) ||
      (headers['x-webhook-timestamp'] as string) ||
      (headers['x-request-timestamp'] as string);
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

    const computedHash = crypto
      .createHmac('sha256', secret)
      .update(`${timestampStr}.${nonce}.${rawBody}`)
      .digest('hex');

    const expectedSignature = signature.startsWith('sha256=')
      ? `sha256=${computedHash}`
      : computedHash;

    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      sigBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Invalid webhook HMAC signature');
    }

    const nonceHash = crypto.createHash('sha256').update(nonce).digest('hex');
    await this.consumeReplayNonce(
      connectorId,
      nonce,
      new Date((requestTime + 300) * 1000),
      nonceHash,
    );
    return true;
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
