import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { WebhookSignatureGuard } from './webhook-signature.guard';
import * as crypto from 'crypto';

describe('WebhookSignatureGuard', () => {
  let guard: WebhookSignatureGuard;

  beforeEach(() => {
    process.env.WEBHOOK_HMAC_SECRET = 'test-webhook-secret';
    guard = new WebhookSignatureGuard({
      webhookReplayNonce: { deleteMany: jest.fn(), create: jest.fn() },
    } as any);
  });

  it('should allow request when valid HMAC-SHA256 signature is provided', async () => {
    const secret = 'test-webhook-secret';
    const payload = { eventId: 'evt-100' };
    const payloadString = JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = 'nonce-100';
    const signature = `sha256=${crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${nonce}.${payloadString}`)
      .digest('hex')}`;

    const context: any = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            'x-hub-signature-256': signature,
            'x-timestamp': timestamp,
            'x-webhook-nonce': nonce,
          },
          params: { connectorId: 'connector-1' },
          rawBody: Buffer.from(payloadString),
          body: payload,
        }),
      }),
    };

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('should throw UnauthorizedException when signature is invalid', async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const context: any = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            'x-hub-signature-256': 'sha256=invalid',
            'x-timestamp': timestamp,
            'x-webhook-nonce': 'nonce-invalid',
          },
          params: { connectorId: 'connector-1' },
          rawBody: Buffer.from('{"eventId":"evt-100"}'),
          body: { eventId: 'evt-100' },
        }),
      }),
    };

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
