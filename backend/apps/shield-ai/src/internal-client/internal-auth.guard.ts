import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { verifyWorkloadToken } from '../../../../libs/security/src/workload-token';

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
    const token = typeof authorization === 'string' && authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    try {
      request.workloadIdentity = verifyWorkloadToken(token, 'shield-ai');
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired workload identity');
    }
  }
}
