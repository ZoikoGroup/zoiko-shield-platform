// @vitest-environment node
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const CORE = 'http://core.test:3001';
const INGEST = 'http://ingest.test:3002';

async function loadRoute() {
  vi.stubEnv('SHIELD_CORE_URL', CORE);
  vi.stubEnv('SHIELD_INGEST_URL', INGEST);
  vi.stubEnv('SHIELD_AI_URL', 'http://ai.test:3003');
  vi.stubEnv('SHIELD_ACTION_URL', 'http://action.test:3004');
  vi.stubEnv('SHIELD_ANCHOR_URL', 'http://anchor.test:3005');
  vi.resetModules();
  return import('@/app/api/v1/[...slug]/route');
}

function req(slug: string, method = 'GET', headers: Record<string, string> = {}, body?: string) {
  return {
    request: new NextRequest(`http://localhost:3000/api/v1/${slug}`, { method, headers, body }),
    ctx: { params: Promise.resolve({ slug: slug.split('/') }) },
  };
}

const ok = () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });

describe('API proxy routing', () => {
  beforeEach(() => vi.stubEnv('WEBHOOK_HMAC_SECRET', 'test-secret'));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each(['ai/governance/profiles', 'actions/rollback', 'anchor/proofs/1/2', 'response/freeze-status', 'streaming/events', 'events', 'alerts'])(
    'sends %s to shield-core, never to a workload-token-only service',
    async (slug) => {
      const { GET } = await loadRoute();
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok());
      const { request, ctx } = req(slug);
      await GET(request, ctx);
      expect(String(fetchSpy.mock.calls[0][0])).toBe(`${CORE}/api/v1/${slug}`);
    },
  );

  it('does not sign or forward a webhook from a caller without a session', async () => {
    const { POST } = await loadRoute();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok());
    const { request, ctx } = req('ingestion/webhooks/conn-1', 'POST', { 'content-type': 'application/json' }, '{"x":1}');

    const res = await POST(request, ctx);

    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not sign a webhook for a connector outside the caller's tenant", async () => {
    const { POST } = await loadRoute();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"message":"Connector not found"}', { status: 404 }));
    const { request, ctx } = req(
      'ingestion/webhooks/someone-elses',
      'POST',
      { 'content-type': 'application/json', authorization: 'Bearer user-token', 'x-tenant-id': 't1' },
      '{"x":1}',
    );

    const res = await POST(request, ctx);

    expect(res.status).toBe(403);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toBe(`${CORE}/api/v1/connectors/someone-elses`);
  });

  it('signs and forwards to shield-ingest once shield-core confirms the connector is the caller\'s', async () => {
    const { POST } = await loadRoute();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok());
    const { request, ctx } = req(
      'ingestion/webhooks/conn-1',
      'POST',
      { 'content-type': 'application/json', authorization: 'Bearer user-token', 'x-tenant-id': 't1', 'x-webhook-nonce': 'client-chosen' },
      '{"x":1}',
    );

    const res = await POST(request, ctx);

    expect(res.status).toBe(200);
    expect(String(fetchSpy.mock.calls[0][0])).toBe(`${CORE}/api/v1/connectors/conn-1`);
    const [url, init] = fetchSpy.mock.calls[1];
    expect(String(url)).toBe(`${INGEST}/api/v1/ingestion/webhooks/conn-1`);
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['x-webhook-signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(headers['x-webhook-nonce']).not.toBe('client-chosen');
  });

  it('refuses to sign at all when no webhook secret is configured', async () => {
    vi.stubEnv('WEBHOOK_HMAC_SECRET', '');
    const { POST } = await loadRoute();
    vi.stubEnv('WEBHOOK_HMAC_SECRET', '');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok());
    const { request, ctx } = req('ingestion/webhooks/conn-1', 'POST', { authorization: 'Bearer t' }, '{}');

    const res = await POST(request, ctx);

    expect(res.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('trustedClientIp', () => {
  it('forwards nothing unless trusted proxy hops are configured', async () => {
    const { trustedClientIp } = await import('@/lib/client-ip');
    expect(trustedClientIp('1.2.3.4', 0)).toBeUndefined();
    expect(trustedClientIp(null, 1)).toBeUndefined();
  });

  it('takes the address appended by the trusted hop, not one the client wrote', async () => {
    const { trustedClientIp } = await import('@/lib/client-ip');
    // client forged "6.6.6.6"; our one load balancer appended the real 203.0.113.9
    expect(trustedClientIp('6.6.6.6, 203.0.113.9', 1)).toBe('203.0.113.9');
    // two trusted hops: client, lb1-appended, lb2-appended
    expect(trustedClientIp('6.6.6.6, 203.0.113.9, 10.0.0.2', 2)).toBe('203.0.113.9');
  });
});
