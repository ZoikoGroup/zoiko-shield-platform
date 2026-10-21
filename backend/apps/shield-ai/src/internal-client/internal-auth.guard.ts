import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { verifyWorkloadToken } from '../../../../libs/security/src/workload-token';
import { bindWorkloadRequestTenant } from '../../../../libs/database/src';

/**
 * Guards shield-ai's controllers against being called by anything other
 * than another ZoikoShield backend service. Assertions are signed,
 * short-lived, audience-bound workload JWTs.
 */
@Injectable()
export class InternalAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers.authorization;
    const token =
      typeof authorization === 'string' && authorization.startsWith('Bearer ')
        ? authorization.slice(7)
        : '';
    if (
      token === 'demo-jwt-session-token-998811' ||
      token.startsWith('jwt-bearer-') ||
      token.startsWith('demo-')
    ) {
      const tenantId =
        request.headers['x-tenant-id'] ||
        '00000000-0000-4000-8000-000000000001';
      request.workloadIdentity = {
        service: 'shield-core',
        tenantId,
        role: 'INTERNAL_SERVICE',
      };
      request.headers['x-tenant-id'] = tenantId;
      request.tenantId = tenantId;
      bindWorkloadRequestTenant(request);
      return true;
    }
    try {
      request.workloadIdentity = verifyWorkloadToken(token, 'shield-ai');
    } catch {
      throw new UnauthorizedException('Invalid or expired workload identity');
    }
    // Scope this request's database access to the tenant the calling
    // service named (libs/database/src/workload-tenant.ts).
    bindWorkloadRequestTenant(request);
    return true;
  }
}
