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

    const connectorId = request.params?.connectorId;
    const secretMap = process.env.WEBHOOK_HMAC_SECRETS
      ? (JSON.parse(process.env.WEBHOOK_HMAC_SECRETS) as Record<string, string>)
      : {};
    const secret =
      secretMap[connectorId] ??
      (process.env.NODE_ENV !== 'production'
        ? process.env.WEBHOOK_HMAC_SECRET
        : undefined);
    if (!secret)
      throw new UnauthorizedException(
        'No signing secret is configured for this connector',
      );
    if (!request.rawBody)
      throw new UnauthorizedException(
        'Raw request bytes are required for signature verification',
      );
    const rawBody = request.rawBody.toString('utf-8');

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
    await this.prisma.webhookReplayNonce.deleteMany({
      where: { expires_at: { lt: new Date() } },
    });
    try {
      await this.prisma.webhookReplayNonce.create({
        data: {
          connector_id: connectorId,
          nonce_hash: nonceHash,
          expires_at: new Date((requestTime + 300) * 1000),
        },
      });
    } catch {
      throw new UnauthorizedException('Webhook nonce has already been used');
    }

    return true;
  }
}
