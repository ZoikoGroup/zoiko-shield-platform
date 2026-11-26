import {
  IngestionWebhookGatewayController,
  pickWebhookHeaders,
} from './ingestion-webhook-gateway.controller';
import { ShieldIngestClient } from '../../internal-client/shield-ingest.client';
import { ENDPOINT_ACCESS_KEY } from '../../security/endpoint-access.decorator';

const ID = '53a1d1e1-8149-47a9-bf19-249ef5c3b918';

function res() {
  const r: any = { statusCode: 200 };
  r.status = jest.fn((c: number) => {
    r.statusCode = c;
    return r;
  });
  return r;
}

describe('IngestionWebhookGatewayController', () => {
  let forwardWebhook: jest.Mock;
  let controller: IngestionWebhookGatewayController;

  beforeEach(() => {
    forwardWebhook = jest.fn().mockResolvedValue({ status: 202, body: { statusCode: 202 } });
    controller = new IngestionWebhookGatewayController({ forwardWebhook } as any);
  });

  it('is declared as externally authenticated, not as a session route', () => {
    expect(Reflect.getMetadata(ENDPOINT_ACCESS_KEY, IngestionWebhookGatewayController)).toBe(
      'EXTERNAL_AUTHENTICATED',
    );
  });

  it('forwards the body byte-for-byte, whatever its encoding or whitespace', async () => {
    // Signatures cover the transmitted bytes; re-serialising would break them.
    const raw = Buffer.from('{ "name":  "café ☃",\n "n": 1.0 }\n', 'utf8');
    const r = res();
    await controller.receive(ID, { rawBody: raw, headers: {}, ip: '203.0.113.9' } as any, r);
    expect(forwardWebhook.mock.calls[0][1]).toBe(raw);
  });

  it('relays the ingest answer and status', async () => {
    forwardWebhook.mockResolvedValue({ status: 202, body: { statusCode: 202, message: 'accepted' } });
    const r = res();
    const out = await controller.receive(ID, { rawBody: Buffer.from('{}'), headers: {}, ip: '1.2.3.4' } as any, r);
    expect(r.statusCode).toBe(202);
    expect(out).toEqual({ statusCode: 202, message: 'accepted' });
  });

  it('rejects anything that is not a UUID without contacting ingest', async () => {
    for (const bad of ['../connectors', 'abc', `${ID}/x`, '%2e%2e', 'x'.repeat(200), '']) {
      const r = res();
      await controller.receive(bad, { rawBody: Buffer.from('{}'), headers: {}, ip: '1.2.3.4' } as any, r);
      expect(r.statusCode).toBe(404);
    }
    expect(forwardWebhook).not.toHaveBeenCalled();
  });

  it('rejects an empty body without contacting ingest', async () => {
    const r = res();
    await controller.receive(ID, { rawBody: Buffer.alloc(0), headers: {}, ip: '1.2.3.4' } as any, r);
    expect(r.statusCode).toBe(400);
    const r2 = res();
    await controller.receive(ID, { headers: {}, ip: '1.2.3.4' } as any, r2);
    expect(r2.statusCode).toBe(400);
    expect(forwardWebhook).not.toHaveBeenCalled();
  });
});

describe('pickWebhookHeaders', () => {
  it('passes the signature headers ingest verifies', () => {
    const out = pickWebhookHeaders(
      {
        'content-type': 'application/json',
        'x-webhook-signature': 'sha256=abc',
        'x-timestamp': '1700000000',
        'x-webhook-nonce': 'n-1',
        'x-hub-signature-256': 'sha256=def',
        'x-github-delivery': 'uuid',
        'x-github-event': 'push',
      },
      '203.0.113.9',
    );
    expect(out).toMatchObject({
      'content-type': 'application/json',
      'x-webhook-signature': 'sha256=abc',
      'x-timestamp': '1700000000',
      'x-webhook-nonce': 'n-1',
      'x-hub-signature-256': 'sha256=def',
      'x-github-delivery': 'uuid',
      'x-github-event': 'push',
    });
  });

  it('never passes credentials or tenant context from the sender', () => {
    const out = pickWebhookHeaders(
      {
        authorization: 'Bearer stolen',
        cookie: 'access_token=x',
        'x-tenant-id': 'victim-tenant',
        'x-environment-id': 'prod',
        'x-forwarded-for': '10.0.0.1',
        'x-forwarded-host': 'evil.example',
        host: 'api.zoikoshield.com',
        'x-signature': 'sha256=ok',
      },
      '203.0.113.9',
    );
    expect(Object.keys(out).sort()).toEqual(['x-forwarded-for', 'x-signature']);
  });

  it('sets x-forwarded-for from the connection, ignoring what the sender claimed', () => {
    expect(pickWebhookHeaders({ 'x-forwarded-for': '6.6.6.6' }, '203.0.113.9')['x-forwarded-for']).toBe(
      '203.0.113.9',
    );
    expect(pickWebhookHeaders({ 'x-forwarded-for': '6.6.6.6' })['x-forwarded-for']).toBeUndefined();
  });

  it('takes the first value of a repeated header and skips empty ones', () => {
    const out = pickWebhookHeaders({ 'x-signature': ['sha256=a', 'sha256=b'], 'x-timestamp': '' } as any);
    expect(out).toEqual({ 'x-signature': 'sha256=a' });
  });
});

describe('ShieldIngestClient.forwardWebhook', () => {
  const realFetch = global.fetch;
  let client: ShieldIngestClient;
  beforeEach(() => {
    client = new ShieldIngestClient();
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  const answer = (status: number, body: unknown) =>
    jest.fn().mockResolvedValue(
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
    );

  it('posts the exact bytes to ingest with no service credential', async () => {
    global.fetch = answer(202, { statusCode: 202, data: { id: 'x' } }) as any;
    const raw = Buffer.from('{"a": 1}\n');
    const out = await client.forwardWebhook(ID, raw, { 'x-signature': 'sha256=ab' });

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(new RegExp(`/api/v1/ingestion/webhooks/${ID}$`));
    expect(Buffer.from(init.body as Uint8Array).equals(raw)).toBe(true);
    expect(init.headers).toEqual({ 'x-signature': 'sha256=ab' });
    expect(JSON.stringify(init.headers).toLowerCase()).not.toContain('authorization');
    expect(out).toEqual({ status: 202, body: { statusCode: 202, data: { id: 'x' } } });
  });

  it("relays ingest's 4xx decision but only the fields a sender needs", async () => {
    global.fetch = answer(401, {
      statusCode: 401,
      message: 'Invalid webhook HMAC signature',
      error: 'Unauthorized',
      stack: 'at Guard.canActivate (/app/...)',
      internal: 'secret detail',
    }) as any;
    const out = await client.forwardWebhook(ID, Buffer.from('{}'), {});
    expect(out.status).toBe(401);
    expect(out.body).toEqual({
      statusCode: 401,
      message: 'Invalid webhook HMAC signature',
      error: 'Unauthorized',
    });
  });

  it('turns an ingest 5xx into a bare 502 with no internals', async () => {
    global.fetch = answer(500, { message: 'relation "x" does not exist', stack: 'trace' }) as any;
    const out = await client.forwardWebhook(ID, Buffer.from('{}'), {});
    expect(out.status).toBe(502);
    expect(JSON.stringify(out.body)).not.toContain('relation');
  });

  it('reports an unreachable ingest as 503 and a timeout as 504', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed')) as any;
    expect((await client.forwardWebhook(ID, Buffer.from('{}'), {})).status).toBe(503);
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    global.fetch = jest.fn().mockRejectedValue(timeout) as any;
    expect((await client.forwardWebhook(ID, Buffer.from('{}'), {})).status).toBe(504);
  });
});
