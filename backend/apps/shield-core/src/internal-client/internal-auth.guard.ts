import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { verifyWorkloadToken } from '../../../../libs/security/src/workload-token';

/**
 * Guards shield-core's /internal/v1/* endpoints — reachable only from
 * shield-ai/shield-action, never the frontend. Tokens are signed,
 * audience-bound, one-minute workload identity assertions.
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
      request.workloadIdentity = verifyWorkloadToken(token, 'shield-core');
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired workload identity');
    }
  }
}
