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
      connectorInstance: {
        findFirst: jest.fn().mockResolvedValue({ tenant_id: 'tenant-1' }),
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
    // A verified delivery scopes the request to its connector's tenant.
    expect(mockPrisma.connectorInstance.findFirst).toHaveBeenCalledWith({
      where: { id: 'conn-1' },
      select: { tenant_id: true },
    });
  });

  it('still rejects a genuine replay (duplicate connector_id + nonce) as already processed', async () => {
    const rawBody = '{"event":"threat.detected","id":"123"}';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = 'nonce-uuid-replay';
    const secret = 'super-secret-key-123';
    const hash = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${nonce}.${rawBody}`)
      .digest('hex');
    const context = createMockContext(
      { 'x-signature': `sha256=${hash}`, 'x-timestamp': timestamp, 'x-webhook-nonce': nonce },
      { connectorId: 'conn-1' },
      rawBody,
    );
    mockPrisma.webhookReplayNonce.create.mockRejectedValue({ code: 'P2002' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      'Webhook delivery has already been processed',
    );
  });

  it('does not mislabel an unrelated database failure as a replay, e.g. a route with no :connectorId', async () => {
    // POST /api/v1/ingest/stream/batch has no :connectorId in its path, so
    // request.params.connectorId is undefined here, same as in production.
    // The required connector_id column then fails Prisma's own validation -
    // not a unique-constraint violation - and that must surface as-is.
    const rawBody = '{"events":[]}';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = 'nonce-uuid-no-connector';
    const secret = 'super-secret-key-123';
    const hash = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${nonce}.${rawBody}`)
      .digest('hex');
    const context = createMockContext(
      { 'x-signature': `sha256=${hash}`, 'x-timestamp': timestamp, 'x-webhook-nonce': nonce },
      {},
      rawBody,
    );
    const validationError = new Error('Argument connector_id is missing');
    mockPrisma.webhookReplayNonce.create.mockRejectedValue(validationError);

    await expect(guard.canActivate(context)).rejects.toThrow('Argument connector_id is missing');
    await expect(guard.canActivate(context)).rejects.not.toThrow(
      'Webhook delivery has already been processed',
    );
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

  describe('GitHub-native delivery (X-GitHub-Delivery + X-Hub-Signature-256)', () => {
    it('allows a genuine GitHub signature with no nonce/timestamp headers', async () => {
      const rawBody = '{"ref":"refs/heads/main","commits":[]}';
      const secret = 'super-secret-key-123';
      const hash = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

      const context = createMockContext(
        {
          'x-hub-signature-256': `sha256=${hash}`,
          'x-github-delivery': 'a1b2c3d4-e5f6-4789-a012-b3c4d5e6f789',
          'x-github-event': 'push',
        },
        { connectorId: 'conn-1' },
        rawBody,
      );

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(mockPrisma.webhookReplayNonce.create).toHaveBeenCalled();
    });

    it('rejects a GitHub delivery with a tampered signature', async () => {
      const rawBody = '{"ref":"refs/heads/main","commits":[]}';

      const context = createMockContext(
        {
          'x-hub-signature-256':
            'sha256=0000000000000000000000000000000000000000000000000000000000000000',
          'x-github-delivery': 'a1b2c3d4-e5f6-4789-a012-b3c4d5e6f789',
          'x-github-event': 'push',
        },
        { connectorId: 'conn-1' },
        rawBody,
      );

      await expect(guard.canActivate(context)).rejects.toThrow(
        'Invalid GitHub webhook HMAC signature',
      );
    });

    it('rejects a replayed GitHub delivery id', async () => {
      const rawBody = '{"ref":"refs/heads/main","commits":[]}';
      const secret = 'super-secret-key-123';
      const hash = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

      // Real @prisma/client unique-constraint violations carry code: 'P2002',
      // the same shape the guard now requires before treating this as a replay.
      mockPrisma.webhookReplayNonce.create.mockRejectedValueOnce({
        code: 'P2002',
      });

      const context = createMockContext(
        {
          'x-hub-signature-256': `sha256=${hash}`,
          'x-github-delivery': 'a1b2c3d4-e5f6-4789-a012-b3c4d5e6f789',
          'x-github-event': 'push',
        },
        { connectorId: 'conn-1' },
        rawBody,
      );

      await expect(guard.canActivate(context)).rejects.toThrow(
        'Webhook delivery has already been processed',
      );
    });
  });
});
