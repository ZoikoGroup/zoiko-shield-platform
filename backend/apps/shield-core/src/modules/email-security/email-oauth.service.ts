import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';

export const EMAIL_OAUTH_FETCH = Symbol('EMAIL_OAUTH_FETCH');

export type OAuthProvider = 'MICROSOFT_365' | 'GOOGLE_WORKSPACE';

interface ProviderOAuthConfig {
  authorizeUrl: string;
  tokenUrl: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  /** Server-defined, read-only Phase 0 scopes. Clients cannot widen these. */
  scopes: string[];
  extraAuthorizeParams: Record<string, string>;
}

const PROVIDERS: Record<OAuthProvider, ProviderOAuthConfig> = {
  MICROSOFT_365: {
    authorizeUrl:
      'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize',
    tokenUrl:
      'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
    clientIdEnv: 'EMAIL_OAUTH_MS_CLIENT_ID',
    clientSecretEnv: 'EMAIL_OAUTH_MS_CLIENT_SECRET',
    scopes: [
      'offline_access',
      'https://graph.microsoft.com/SecurityAlert.Read.All',
    ],
    extraAuthorizeParams: { response_mode: 'query', prompt: 'consent' },
  },
  GOOGLE_WORKSPACE: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientIdEnv: 'EMAIL_OAUTH_GOOGLE_CLIENT_ID',
    clientSecretEnv: 'EMAIL_OAUTH_GOOGLE_CLIENT_SECRET',
    scopes: ['https://www.googleapis.com/auth/apps.alerts'],
    extraAuthorizeParams: {
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'false',
    },
  },
};

export interface OAuthTokenResult {
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number;
  /** Scopes the PROVIDER says were granted — never taken from the client. */
  grantedScopes: string[];
}

/**
 * OAuth 2.0 authorization-code + PKCE (S256) client for provider consent
 * (ZS-UX-EMTI-001 WF-03, T04). State and verifier are generated server-side;
 * the browser only ever sees the authorization URL.
 */
@Injectable()
export class EmailOAuthService {
  private readonly fetchFn: typeof fetch;

  constructor(@Optional() @Inject(EMAIL_OAUTH_FETCH) fetchFn?: typeof fetch) {
    this.fetchFn = fetchFn ?? ((...args) => fetch(...args));
  }

  static readOnlyScopes(provider: OAuthProvider): string[] {
    return [...PROVIDERS[provider].scopes];
  }

  private redirectUri(): string {
    const uri = process.env.EMAIL_OAUTH_REDIRECT_URI?.trim();
    if (!uri || !/^https?:\/\//.test(uri)) {
      throw new BadRequestException(
        'PROVIDER_OAUTH_NOT_CONFIGURED: EMAIL_OAUTH_REDIRECT_URI is not set',
      );
    }
    return uri;
  }

  private credentials(provider: OAuthProvider) {
    const cfg = PROVIDERS[provider];
    const clientId = process.env[cfg.clientIdEnv]?.trim();
    const clientSecret = process.env[cfg.clientSecretEnv]?.trim();
    if (!clientId || !clientSecret) {
      throw new BadRequestException(
        `PROVIDER_OAUTH_NOT_CONFIGURED: ${cfg.clientIdEnv}/${cfg.clientSecretEnv} are not set for ${provider}`,
      );
    }
    return { cfg, clientId, clientSecret };
  }

  isConfigured(provider: OAuthProvider): boolean {
    try {
      this.credentials(provider);
      this.redirectUri();
      return true;
    } catch {
      return false;
    }
  }

  static newState(): string {
    return randomBytes(32).toString('base64url');
  }

  static newCodeVerifier(): string {
    return randomBytes(48).toString('base64url'); // 64 chars, within RFC 7636 43..128
  }

  static codeChallenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
  }

  buildAuthorizationUrl(
    provider: OAuthProvider,
    state: string,
    codeVerifier: string,
  ): string {
    const { cfg, clientId } = this.credentials(provider);
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri(),
      scope: cfg.scopes.join(' '),
      state,
      code_challenge: EmailOAuthService.codeChallenge(codeVerifier),
      code_challenge_method: 'S256',
      ...cfg.extraAuthorizeParams,
    });
    return `${cfg.authorizeUrl}?${params.toString()}`;
  }

  private async tokenRequest(
    provider: OAuthProvider,
    body: Record<string, string>,
  ): Promise<OAuthTokenResult> {
    const { cfg, clientId, clientSecret } = this.credentials(provider);
    let response: Response;
    try {
      response = await this.fetchFn(cfg.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          ...body,
        }).toString(),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new BadGatewayException(
        `OAUTH_PROVIDER_UNREACHABLE: ${(err as Error).name}`,
      );
    }
    const json = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!response.ok || typeof json.access_token !== 'string') {
      // Provider error codes only; never echo tokens or the request body.
      const code =
        typeof json.error === 'string' ? json.error : 'unknown_error';
      throw new BadRequestException(
        `OAUTH_TOKEN_EXCHANGE_FAILED: provider returned ${response.status} ${code}`,
      );
    }
    const scopeText = typeof json.scope === 'string' ? json.scope : '';
    return {
      accessToken: json.access_token,
      refreshToken:
        typeof json.refresh_token === 'string' ? json.refresh_token : null,
      expiresInSeconds: Number(json.expires_in) || 3600,
      grantedScopes: scopeText.split(/\s+/).filter(Boolean),
    };
  }

  exchangeCode(
    provider: OAuthProvider,
    code: string,
    codeVerifier: string,
  ): Promise<OAuthTokenResult> {
    return this.tokenRequest(provider, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri(),
      code_verifier: codeVerifier,
    });
  }

  refreshAccessToken(
    provider: OAuthProvider,
    refreshToken: string,
  ): Promise<OAuthTokenResult> {
    return this.tokenRequest(provider, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      ...(provider === 'MICROSOFT_365'
        ? { scope: PROVIDERS.MICROSOFT_365.scopes.join(' ') }
        : {}),
    });
  }
}
