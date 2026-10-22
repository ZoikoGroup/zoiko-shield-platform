// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/v1/[...slug]/route';

const call = (handler: typeof POST, slug: string, body?: unknown, cookie?: string) =>
  handler(
    new NextRequest(`http://localhost:3000/api/v1/${slug}`, {
      method: handler === GET ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params: Promise.resolve({ slug: slug.split('/') }) },
  );

const backendDown = () =>
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

describe('API proxy authentication when the backend is unreachable', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects an unknown account instead of inventing a session', async () => {
    backendDown();
    const res = await call(POST, 'auth/login', { email: 'nobody.admin@invalid.test', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('rejects a documented demo account with the wrong password', async () => {
    backendDown();
    const res = await call(POST, 'auth/login', { email: 'super.admin@zoikoshield.local', password: 'guess' });

    expect(res.status).toBe(401);
  });

  it('signs in a documented demo account with its role taken from the account, not the email', async () => {
    backendDown();
    const res = await call(POST, 'auth/login', {
      email: 'Marcus.Vance@acme.com',
      password: 'Analyst2026!SecOps',
      tenantId: 'tenant-acme-corp',
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.role).toBe('SECURITY_ANALYST');
    expect(body.tenantId).toBe('tenant-acme-corp');
    expect(res.headers.get('x-zoiko-fallback')).toBe('true');
  });

  it('rejects a demo account signing in to a tenant it does not belong to', async () => {
    backendDown();
    const res = await call(POST, 'auth/login', {
      email: 'marcus.vance@acme.com',
      password: 'Analyst2026!SecOps',
      tenantId: 'tenant-zoiko-platform',
    });

    expect(res.status).toBe(401);
  });

  it('lets an account created through offline registration sign in with its own password only', async () => {
    backendDown();
    await call(POST, 'auth/register', {
      organizationName: 'Tester Org',
      slug: 'tester-org',
      fullName: 'Manual Tester',
      email: 'manual.tester@example.test',
      password: 'Tester#2026pass',
    });

    const ok = await call(POST, 'auth/login', { email: 'manual.tester@example.test', password: 'Tester#2026pass' });
    const bad = await call(POST, 'auth/login', { email: 'manual.tester@example.test', password: 'nope' });

    expect(ok.status).toBe(200);
    expect((await ok.json()).role).toBe('TENANT_OWNER');
    expect(bad.status).toBe(401);
  });

  it('reports passkey ceremonies and step-up as unavailable rather than verified', async () => {
    backendDown();
    const options = await call(POST, 'auth/passkeys/authentication/options', { email: 'x@y.z' });
    const stepUp = await call(POST, 'authz/jit/req-1/stepup', { credentialId: 'fake' });

    expect(options.status).toBe(503);
    expect(stepUp.status).toBe(503);
    expect(await stepUp.json()).not.toHaveProperty('verified');
  });

  it('marks fabricated demo data so the UI can withhold it', async () => {
    backendDown();
    const res = await call(GET, 'notifications');

    expect(res.headers.get('x-zoiko-fallback')).toBe('true');
  });
});

describe('API proxy authentication when the backend answers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards a wrong-password 401 from the backend', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 401, message: 'Invalid credentials' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const res = await call(POST, 'auth/login', { email: 'sarah.chen@acme.com', password: 'Demo2026!Secure' });

    expect(res.status).toBe(401);
    expect(res.headers.get('x-zoiko-fallback')).toBeNull();
    expect((await res.json()).message).toBe('Invalid credentials');
  });

  it('forwards a failed step-up verdict instead of fabricating verified: true', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 403, message: 'Assertion signature invalid' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const res = await call(POST, 'authz/jit/req-1/stepup', { credentialId: 'fake' });

    expect(res.status).toBe(403);
  });
});
