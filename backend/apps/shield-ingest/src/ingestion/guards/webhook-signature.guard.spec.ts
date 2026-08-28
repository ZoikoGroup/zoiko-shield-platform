import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { WebhookSignatureGuard } from './webhook-signature.guard';
import { PrismaService } from '../../prisma/prisma.service';

describe('WebhookSignatureGuard', () => {
  let guard: WebhookSignatureGuard;
  let mockPrisma: any;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    process.env.WEBHOOK_HMAC_SECRET = 'super-secret-key-123';
    process.env.NODE_ENV = 'test';

    mockPrisma = {
      webhookReplayNonce: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 'nonce-1' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookSignatureGuard,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    guard = module.get<WebhookSignatureGuard>(WebhookSignatureGuard);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function createMockContext(
    headers: Record<string, string>,
    params: any = { connectorId: 'conn-1' },
    rawBodyStr = '{"event":"test"}',
  ): ExecutionContext {
    const request = {
      headers,
      params,
      rawBody: Buffer.from(rawBodyStr, 'utf-8'),
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  it('allows valid HMAC-SHA256 signature and fresh timestamp', async () => {
    const rawBody = '{"event":"threat.detected","id":"123"}';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = 'nonce-uuid-abc-123';
    const secret = 'super-secret-key-123';

    const hash = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${nonce}.${rawBody}`)
      .digest('hex');

    const context = createMockContext(
      {
        'x-signature': `sha256=${hash}`,
        'x-timestamp': timestamp,
        'x-webhook-nonce': nonce,
      },
      { connectorId: 'conn-1' },
      rawBody,
    );

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(mockPrisma.webhookReplayNonce.create).toHaveBeenCalled();
  });

  it('rejects request with missing signature header', async () => {
    const context = createMockContext({
      'x-timestamp': Math.floor(Date.now() / 1000).toString(),
      'x-webhook-nonce': 'nonce-123',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects request with expired timestamp (> 300 seconds skew)', async () => {
    const rawBody = '{"event":"threat.detected"}';
    const expiredTimestamp = (Math.floor(Date.now() / 1000) - 400).toString();
    const nonce = 'nonce-expired';
    const secret = 'super-secret-key-123';

    const hash = crypto
      .createHmac('sha256', secret)
      .update(`${expiredTimestamp}.${nonce}.${rawBody}`)
      .digest('hex');

    const context = createMockContext(
      {
        'x-signature': `sha256=${hash}`,
        'x-timestamp': expiredTimestamp,
        'x-webhook-nonce': nonce,
      },
      { connectorId: 'conn-1' },
      rawBody,
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      'Webhook request timestamp expired or invalid',
    );
  });

  it('rejects request with tampered payload signature mismatch', async () => {
    const rawBody = '{"event":"threat.detected"}';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = 'nonce-tampered';

    const context = createMockContext(
      {
        'x-signature':
          'sha256=invalid-tampered-hash-00000000000000000000000000000000000000000000',
        'x-timestamp': timestamp,
        'x-webhook-nonce': nonce,
      },
      { connectorId: 'conn-1' },
      rawBody,
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      'Invalid webhook HMAC signature',
    );
  });
});
