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

    // Secret key for HMAC verification (or environment configured secret)
    const secret = process.env.WEBHOOK_HMAC_SECRET || 'zoiko-shield-webhook-secret';
    const signature =
      (headers['x-hub-signature-256'] as string) ||
      (headers['x-signature'] as string);

    // If signature header is not present in development, log warning or enforce in production
    if (!signature) {
      if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException('Missing required webhook HMAC signature header');
      }
      return true;
    }

    const payload = JSON.stringify(request.body || {});
    const expectedSignature = `sha256=${crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex')}`;

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
