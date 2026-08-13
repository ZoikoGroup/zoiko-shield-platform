import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { verifyWorkloadToken } from '../../../../libs/security/src/workload-token';

/** Signed, short-lived, audience-bound workload identity guard. */
@Injectable()
export class InternalAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers.authorization;
    const token = typeof authorization === 'string' && authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    try {
      request.workloadIdentity = verifyWorkloadToken(token, 'shield-anchor');
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired workload identity');
    }
  }
}
