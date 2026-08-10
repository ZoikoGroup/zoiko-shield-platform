import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthContext } from '../oauth/oauth-token.service';

/**
 * Token claims are not the only authority (spec §32/correction #9) —
 * every request re-validates client existence/ACTIVE status/tenant binding
 * fresh from the database, never trusting the JWT payload alone. A
 * revoked/suspended client's still-unexpired token is rejected here, not
 * just at issuance time.
 */
@Injectable()
export class ApiClientAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let payload: { sub: string; tenant: string; scopes: string[]; jti: string };
    try {
      payload = await this.jwtService.verifyAsync(authHeader.slice('Bearer '.length));
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const apiClient = await this.prisma.apiClient.findFirst({ where: { principal_id: payload.sub, tenant_id: payload.tenant } });
    if (!apiClient || apiClient.status !== 'ACTIVE') {
      throw new UnauthorizedException('Client is not active — token authority revoked since issuance');
    }
    if (apiClient.expires_at && apiClient.expires_at < new Date()) {
      throw new UnauthorizedException('Client has expired');
    }

    const authContext: AuthContext = {
      principalId: payload.sub,
      principalType: 'CLIENT',
      tenantId: payload.tenant,
      scopes: payload.scopes,
      assurance: 'CLIENT_CREDENTIALS',
      purpose: apiClient.purpose,
      correlationId: request.headers['x-correlation-id'] ?? payload.jti,
      traceId: payload.jti,
    };
    request.authContext = authContext;
    return true;
  }
}
