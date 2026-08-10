import { Injectable, Logger } from '@nestjs/common';
import { CredentialService } from '../../services/credential.service';
import { ConnectorAuthenticationError } from '../../core/connector-errors';

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

/**
 * Real OAuth2 client-credentials token acquisition against Microsoft Entra.
 * Replaces the previous hardcoded fake-access-token placeholder — nothing
 * in this codebase has ever actually authenticated to Microsoft Graph
 * before this. Tokens are cached in memory per connector instance and
 * re-acquired once within 60s of expiry; nothing is persisted (access
 * tokens are short-lived and regenerable from the stored client secret).
 */
@Injectable()
export class EntraTokenService {
  private readonly logger = new Logger(EntraTokenService.name);
  private readonly cache = new Map<string, CachedToken>();

  constructor(private readonly credentialService: CredentialService) {}

  async getAccessToken(instanceId: string, externalTenantId: string): Promise<string> {
    const cached = this.cache.get(instanceId);
    if (cached && cached.expiresAt > Date.now() + 60_000) {
      return cached.accessToken;
    }

    if (!externalTenantId) {
      throw new ConnectorAuthenticationError(
        `Connector instance '${instanceId}' has no externalTenantId — admin consent was never completed`,
      );
    }

    const clientId = process.env.ENTRA_CLIENT_ID;
    if (!clientId) {
      throw new ConnectorAuthenticationError('ENTRA_CLIENT_ID is not configured');
    }
    const clientSecret = await this.credentialService.resolveClientSecret(instanceId);

    const tokenUrl = `https://login.microsoftonline.com/${externalTenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
    });

    let response: Response;
    try {
      response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
    } catch (err) {
      throw new ConnectorAuthenticationError(
        `Network error acquiring Entra access token: ${(err as Error).message}`,
      );
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new ConnectorAuthenticationError(
        `Failed to acquire Entra access token (HTTP ${response.status}): ${errorBody.slice(0, 300)}`,
      );
    }

    const data = (await response.json()) as { access_token: string; expires_in: number };
    this.cache.set(instanceId, {
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    });
    this.logger.log(
      `Acquired new Entra access token for instance ${instanceId}, expires in ${data.expires_in}s`,
    );
    return data.access_token;
  }

  invalidate(instanceId: string): void {
    this.cache.delete(instanceId);
  }

  /**
   * Client-credentials access tokens carry the actually-granted app roles
   * (API permissions) in their `roles` claim — decoding this (no signature
   * verification needed, we already trust the token we just received over
   * TLS from Microsoft) is how permission drift is detected without an
   * extra Graph call.
   */
  decodeGrantedRoles(accessToken: string): string[] {
    try {
      const payloadSegment = accessToken.split('.')[1];
      const payload = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8')) as {
        roles?: string[];
      };
      return payload.roles ?? [];
    } catch (err) {
      this.logger.warn(`Failed to decode access token roles: ${(err as Error).message}`);
      return [];
    }
  }
}
