import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { WebhookSignatureGuard } from './webhook-signature.guard';
import * as crypto from 'crypto';

describe('WebhookSignatureGuard', () => {
  let guard: WebhookSignatureGuard;

  beforeEach(() => {
    guard = new WebhookSignatureGuard();
  });

  it('should allow request when valid HMAC-SHA256 signature is provided', () => {
    const secret = 'zoiko-shield-webhook-secret';
    const payload = { eventId: 'evt-100' };
    const payloadString = JSON.stringify(payload);
    const signature = `sha256=${crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex')}`;

    const context: any = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { 'x-hub-signature-256': signature },
          body: payload,
        }),
      }),
    };

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw UnauthorizedException when signature is invalid', () => {
    const context: any = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { 'x-hub-signature-256': 'sha256=invalid' },
          body: { eventId: 'evt-100' },
        }),
      }),
    };

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
