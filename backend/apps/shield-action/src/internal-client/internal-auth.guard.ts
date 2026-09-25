import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { verifyWorkloadToken } from '../../../../libs/security/src/workload-token';
import { bindWorkloadRequestTenant } from '../../../../libs/database/src';

/**
 * Guards shield-action's controllers against being called by anything other
 * than another ZoikoShield backend service.
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
    try {
      request.workloadIdentity = verifyWorkloadToken(token, 'shield-action');
    } catch {
      throw new UnauthorizedException('Invalid or expired workload identity');
    }
    // Scope this request's database access to the tenant the calling
    // service named (libs/database/src/workload-tenant.ts).
    bindWorkloadRequestTenant(request);
    return true;
  }
}
