// @vitest-environment node
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import crypto from 'crypto';
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

const handlerWith = (handler: typeof POST, slug: string, body: unknown, headers: Record<string, string>) =>
  handler(
    new NextRequest(`http://localhost:3000/api/v1/${slug}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ slug: slug.split('/') }) },
  );

const backendDown = () =>
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

const backendSays = (status: number, body: unknown) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

/** An attacker-built account list, as the old client stored it and the old proxy trusted it. */
const forgedAccounts = (email: string, tenantId: string) =>
  encodeURIComponent(
    JSON.stringify([{ email, passwordSha256: sha256('attacker-pw'), fullName: 'X', role: 'SUPER_ADMIN', tenantId }]),
  );

describe('API proxy by default (no demo fallback)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('answers 503 when the backend is unreachable, without demo data', async () => {
    backendDown();
    const res = await call(GET, 'alerts');

    expect(res.status).toBe(503);
    expect(res.headers.get('x-zoiko-fallback')).toBeNull();
    expect(res.headers.get('x-zoiko-backend-unreachable')).toBe('true');
  });

  it('forwards a backend 401 on a data path instead of serving demo records', async () => {
    backendSays(401, { statusCode: 401, message: 'Unauthorized' });
    const res = await call(GET, 'cases');

    expect(res.status).toBe(401);
    expect(res.headers.get('x-zoiko-fallback')).toBeNull();
  });

  it('forwards a backend 404 instead of a blanket 200', async () => {
    backendSays(404, { statusCode: 404, message: 'Cannot GET /api/v1/dashboard/summary' });
    const res = await call(GET, 'dashboard/summary');

    expect(res.status).toBe(404);
  });

  it('does not sign anyone in when the backend is down, not even a configured demo account', async () => {
    vi.stubEnv('OFFLINE_DEMO_ACCOUNTS', JSON.stringify([
      { email: 'demo@example.test', password: 'Demo#2026', fullName: 'Demo', role: 'TENANT_OWNER', tenantId: 't-1' },
    ]));
    backendDown();
    const res = await call(POST, 'auth/login', { email: 'demo@example.test', password: 'Demo#2026', tenantId: 't-1' });

    expect(res.status).toBe(503);
    vi.unstubAllEnvs();
  });

  it('ignores a forged account list in a header or cookie when the backend rejects the login', async () => {
    backendSays(401, { statusCode: 401, message: 'Invalid credentials' });
    const res = await handlerWith(POST, 'auth/login',
      { email: 'victim@acme.test', password: 'attacker-pw', tenantId: 't-1' },
      { 'x-zoiko-offline-accounts': forgedAccounts('victim@acme.test', 't-1'),
        cookie: `zoiko_offline_accounts=${forgedAccounts('victim@acme.test', 't-1')}` });

    expect(res.status).toBe(401);
    expect(res.headers.get('x-zoiko-fallback')).toBeNull();
  });
});

describe('API proxy authentication when the backend is unreachable (demo fallback on)', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_FALLBACK', 'true');
    vi.stubEnv('OFFLINE_DEMO_ACCOUNTS', JSON.stringify([
      { email: 'super.admin@zoikoshield.local', password: 'Admin2026!Platform', fullName: 'Platform Super Admin', role: 'SUPER_ADMIN', tenantId: 'tenant-zoiko-platform' },
      { email: 'marcus.vance@acme.com', password: 'Analyst2026!SecOps', fullName: 'Marcus Vance', role: 'SECURITY_ANALYST', tenantId: 'tenant-acme-corp' },
    ]));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('ignores a forged account list sent in a header or cookie', async () => {
    backendDown();
    const res = await handlerWith(POST, 'auth/login',
      { email: 'forged@evil.test', password: 'attacker-pw', tenantId: 't-1' },
      { 'x-zoiko-offline-accounts': forgedAccounts('forged@evil.test', 't-1'),
        cookie: `zoiko_offline_accounts=${forgedAccounts('forged@evil.test', 't-1')}` });

    expect(res.status).toBe(401);
  });

  it('does not let a fallback registration take over an existing demo account', async () => {
    backendDown();
    await call(POST, 'auth/register', {
      organizationName: 'Hijack', slug: 'hijack', fullName: 'H',
      email: 'super.admin@zoikoshield.local', password: 'attacker-pw',
    });
    const res = await call(POST, 'auth/login', { email: 'super.admin@zoikoshield.local', password: 'attacker-pw' });

    expect(res.status).toBe(401);
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
    const okMixedCase = await call(POST, 'auth/login', { email: 'Manual.Tester@Example.test', password: 'Tester#2026pass' });
    const bad = await call(POST, 'auth/login', { email: 'manual.tester@example.test', password: 'nope' });

    expect(ok.status).toBe(200);
    expect(okMixedCase.status).toBe(200);
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

describe('API proxy authentication when the backend answers (demo fallback on)', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_FALLBACK', 'true');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
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

  it('forwards a backend login 401 even for an account registered through the fallback', async () => {
    backendDown();
    await call(POST, 'auth/register', {
      organizationName: 'Reg Org', slug: 'reg-org', fullName: 'R',
      email: 'registered.once@example.test', password: 'Reg#2026pass',
    });
    vi.restoreAllMocks();
    backendSays(401, { statusCode: 401, message: 'Invalid credentials' });
    const res = await call(POST, 'auth/login', { email: 'registered.once@example.test', password: 'Reg#2026pass' });

    expect(res.status).toBe(401);
    expect(res.headers.get('x-zoiko-fallback')).toBeNull();
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
