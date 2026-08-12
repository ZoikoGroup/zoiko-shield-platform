import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const headers = request.headers;

    const signature =
      (headers['x-hub-signature-256'] as string) ||
      (headers['x-signature'] as string);

    if (!signature) {
      throw new UnauthorizedException('Missing required webhook HMAC signature header (x-signature or x-hub-signature-256)');
    }

    // Enforce timestamp freshness (within 5 minutes / 300s) to prevent replay attacks
    const timestampStr = (headers['x-timestamp'] as string) || (headers['x-request-timestamp'] as string);
    if (timestampStr) {
      const requestTime = parseInt(timestampStr, 10);
      const currentTime = Math.floor(Date.now() / 1000);
      if (!isNaN(requestTime) && Math.abs(currentTime - requestTime) > 300) {
        throw new UnauthorizedException('Webhook request timestamp expired or clock skew too large');
      }
    }

    const secret = process.env.WEBHOOK_HMAC_SECRET || 'zoiko-shield-webhook-secret';
    const rawBody = request.rawBody ? request.rawBody.toString('utf-8') : JSON.stringify(request.body || {});
    
    const computedHash = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
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

    return true;
  }
}
