import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { WebhookSignatureGuard } from './webhook-signature.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { ConnectorWebhookSecretService } from '../../connectors/services/connector-webhook-secret.service';

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

      mockPrisma.webhookReplayNonce.create.mockRejectedValueOnce(
        new Error('unique constraint violation'),
      );

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

  describe('per-connector secrets', () => {
    const CONNECTOR_SECRET = 'whsec_connector-own-secret';
    const OLD_SECRET = 'whsec_rotated-out-secret';
    let verificationSecrets: jest.Mock;
    let scoped: WebhookSignatureGuard;

    async function build(): Promise<WebhookSignatureGuard> {
      const moduleRef = await Test.createTestingModule({
        providers: [
          WebhookSignatureGuard,
          { provide: PrismaService, useValue: mockPrisma },
          {
            provide: ConnectorWebhookSecretService,
            useValue: { verificationSecrets },
          },
        ],
      }).compile();
      return moduleRef.get(WebhookSignatureGuard);
    }

    function signed(secret: string, nonce: string, rawBody = '{"event":"x"}') {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const hash = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}.${nonce}.${rawBody}`)
        .digest('hex');
      return createMockContext(
        {
          'x-webhook-signature': `sha256=${hash}`,
          'x-timestamp': timestamp,
          'x-webhook-nonce': nonce,
        },
        { connectorId: 'conn-1' },
        rawBody,
      );
    }

    beforeEach(async () => {
      verificationSecrets = jest.fn().mockResolvedValue([CONNECTOR_SECRET]);
      scoped = await build();
    });

    it("accepts a delivery signed with the connector's own secret", async () => {
      await expect(
        scoped.canActivate(signed(CONNECTOR_SECRET, 'n-1')),
      ).resolves.toBe(true);
    });

    it('accepts a rotated-out secret while it is still being returned (grace window)', async () => {
      verificationSecrets.mockResolvedValue([CONNECTOR_SECRET, OLD_SECRET]);
      await expect(
        scoped.canActivate(signed(OLD_SECRET, 'n-2')),
      ).resolves.toBe(true);
    });

    it('rejects a secret that belongs to nobody', async () => {
      await expect(
        scoped.canActivate(signed('whsec_guess', 'n-3')),
      ).rejects.toThrow('Invalid webhook HMAC signature');
    });

    it('re-reads secrets once when the cached ones do not match (just rotated)', async () => {
      verificationSecrets
        .mockResolvedValueOnce([OLD_SECRET])
        .mockResolvedValueOnce([CONNECTOR_SECRET]);
      await expect(
        scoped.canActivate(signed(CONNECTOR_SECRET, 'n-4')),
      ).resolves.toBe(true);
      expect(verificationSecrets).toHaveBeenLastCalledWith('conn-1', {
        fresh: true,
      });
    });

    it('does not grow the list the service returns', async () => {
      const cached = [CONNECTOR_SECRET];
      verificationSecrets.mockResolvedValue(cached);
      await scoped.canActivate(signed(CONNECTOR_SECRET, 'n-5'));
      expect(cached).toEqual([CONNECTOR_SECRET]);
    });

    it('accepts GitHub-native signing with the connector secret', async () => {
      const rawBody = '{"zen":"keep it logically awesome"}';
      const sig =
        'sha256=' +
        crypto.createHmac('sha256', CONNECTOR_SECRET).update(rawBody).digest('hex');
      const ctx = createMockContext(
        { 'x-hub-signature-256': sig, 'x-github-delivery': 'gh-uuid-1' },
        { connectorId: 'conn-1' },
        rawBody,
      );
      await expect(scoped.canActivate(ctx)).resolves.toBe(true);
    });

    it('still honours the shared dev secret outside production (browser proxy)', async () => {
      await expect(
        scoped.canActivate(signed('super-secret-key-123', 'n-6')),
      ).resolves.toBe(true);
    });

    it('does NOT honour the shared secret in production, even if one is set', async () => {
      process.env.NODE_ENV = 'production';
      await expect(
        scoped.canActivate(signed('super-secret-key-123', 'n-7')),
      ).rejects.toThrow('Invalid webhook HMAC signature');
      await expect(
        scoped.canActivate(signed(CONNECTOR_SECRET, 'n-8')),
      ).resolves.toBe(true);
    });

    it('honours an operator-supplied per-connector entry in WEBHOOK_HMAC_SECRETS', async () => {
      verificationSecrets.mockResolvedValue([]);
      process.env.WEBHOOK_HMAC_SECRETS = JSON.stringify({
        'conn-1': 'operator-supplied',
      });
      await expect(
        scoped.canActivate(signed('operator-supplied', 'n-9')),
      ).resolves.toBe(true);
    });

    it('rejects when the connector has no secret and nothing else is configured', async () => {
      verificationSecrets.mockResolvedValue([]);
      delete process.env.WEBHOOK_HMAC_SECRET;
      await expect(
        scoped.canActivate(signed('anything', 'n-10')),
      ).rejects.toThrow('No signing secret is configured for this connector');
    });

    it('does not use up the replay nonce on a bad signature', async () => {
      await scoped
        .canActivate(signed('whsec_wrong', 'n-11'))
        .catch(() => undefined);
      expect(mockPrisma.webhookReplayNonce.create).not.toHaveBeenCalled();
    });
  });
});
