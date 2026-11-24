import { createHash } from 'crypto';
import { EmailOAuthService } from './email-oauth.service';

describe('EmailOAuthService (WF-03, T04)', () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.EMAIL_OAUTH_REDIRECT_URI =
      'https://app.example/email/connectors/callback';
    process.env.EMAIL_OAUTH_MS_CLIENT_ID = 'ms-client';
    process.env.EMAIL_OAUTH_MS_CLIENT_SECRET = 'ms-secret';
    delete process.env.EMAIL_OAUTH_GOOGLE_CLIENT_ID;
    delete process.env.EMAIL_OAUTH_GOOGLE_CLIENT_SECRET;
  });
  afterAll(() => {
    process.env = env;
  });

  it('builds a PKCE S256 authorization URL with server-defined read-only scopes', () => {
    const svc = new EmailOAuthService(jest.fn() as any);
    const verifier = EmailOAuthService.newCodeVerifier();
    const url = new URL(
      svc.buildAuthorizationUrl('MICROSOFT_365', 'st-1', verifier),
    );
    expect(url.searchParams.get('state')).toBe('st-1');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(verifier).digest('base64url'),
    );
    expect(url.searchParams.get('scope')).toBe(
      'offline_access https://graph.microsoft.com/SecurityAlert.Read.All',
    );
    expect(url.searchParams.get('scope')).not.toMatch(/Mail\.Read/i);
    expect(url.toString()).not.toContain('ms-secret');
  });

  it('reports unconfigured providers instead of guessing', () => {
    const svc = new EmailOAuthService(jest.fn() as any);
    expect(svc.isConfigured('MICROSOFT_365')).toBe(true);
    expect(svc.isConfigured('GOOGLE_WORKSPACE')).toBe(false);
    expect(() =>
      svc.buildAuthorizationUrl(
        'GOOGLE_WORKSPACE',
        's',
        EmailOAuthService.newCodeVerifier(),
      ),
    ).toThrow(/PROVIDER_OAUTH_NOT_CONFIGURED/);
  });

  it('exchanges the code with the verifier and returns provider-reported scopes', async () => {
    const fetchFn = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'at',
        refresh_token: 'rt',
        expires_in: 3599,
        scope:
          'https://graph.microsoft.com/SecurityAlert.Read.All offline_access',
      }),
    }));
    const svc = new EmailOAuthService(fetchFn as any);
    const res = await svc.exchangeCode('MICROSOFT_365', 'code-1', 'verifier-1');
    expect(res).toEqual({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresInSeconds: 3599,
      grantedScopes: [
        'https://graph.microsoft.com/SecurityAlert.Read.All',
        'offline_access',
      ],
    });
    const body = new URLSearchParams((fetchFn.mock.calls[0] as any)[1].body);
    expect(body.get('code_verifier')).toBe('verifier-1');
    expect(body.get('grant_type')).toBe('authorization_code');
  });

  it('surfaces provider errors without echoing secrets', async () => {
    const fetchFn = jest.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'invalid_grant',
        error_description: 'bad code',
      }),
    }));
    const svc = new EmailOAuthService(fetchFn as any);
    await expect(svc.exchangeCode('MICROSOFT_365', 'c', 'v')).rejects.toThrow(
      /OAUTH_TOKEN_EXCHANGE_FAILED: provider returned 400 invalid_grant/,
    );
    await expect(
      svc.exchangeCode('MICROSOFT_365', 'c', 'v'),
    ).rejects.not.toThrow(/ms-secret/);
  });
});
