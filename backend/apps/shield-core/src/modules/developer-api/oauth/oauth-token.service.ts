import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { ApiClientService } from '../clients/api-client.service';
import { ApiScopeGrantService } from '../scopes/api-scope-grant.service';

export interface AuthContext {
  principalId: string;
  principalType: 'CLIENT';
  tenantId: string;
  environmentId?: string;
  scopes: string[];
  assurance: string;
  purpose: string;
  authorizationDecisionId?: string;
  correlationId: string;
  traceId: string;
}

/**
 * client_credentials grant only (spec §31). Token claims are informational
 * — every downstream API request STILL independently re-validates client
 * status/tenant binding/scope (spec §32/correction #9), never trusting the
 * token as sole authority.
 */
@Injectable()
export class OauthTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly apiClientService: ApiClientService,
    private readonly scopeGrantService: ApiScopeGrantService,
  ) {}

  async issueToken(params: { grantType: string; clientId: string; clientSecret: string; scope?: string }): Promise<{ access_token: string; token_type: 'Bearer'; expires_in: number; scope: string }> {
    if (params.grantType !== 'client_credentials') {
      throw new BadRequestException(`Unsupported grant_type '${params.grantType}'`);
    }

    const verification = await this.apiClientService.verifyCredential(params.clientId, params.clientSecret);
    if (!verification) {
      throw new UnauthorizedException('Invalid client credentials');
    }

    const grantedScopes = await this.scopeGrantService.getActiveScopes(verification.tenantId, verification.apiClient.id);
    const requestedScopes = params.scope ? params.scope.split(' ') : grantedScopes;
    const scopes = requestedScopes.filter((s) => grantedScopes.includes(s));

    const jti = randomUUID();
    const expiresInSeconds = 900;
    const payload = {
      iss: 'zoikoshield',
      aud: 'zoikoshield-api',
      sub: verification.apiClient.principal_id,
      tenant: verification.tenantId,
      scopes,
      jti,
    };

    const accessToken = await this.jwtService.signAsync(payload, { expiresIn: expiresInSeconds });
    return { access_token: accessToken, token_type: 'Bearer', expires_in: expiresInSeconds, scope: scopes.join(' ') };
  }
}
