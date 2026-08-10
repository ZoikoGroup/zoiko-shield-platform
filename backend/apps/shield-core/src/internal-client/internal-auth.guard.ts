import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

/**
 * Guards shield-core's /internal/v1/* endpoints — reachable only from
 * shield-ai/shield-action, never the frontend. Shared-secret header check,
 * same pattern used by shield-ai's own InternalAuthGuard.
 */
@Injectable()
export class InternalAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = request.headers['x-internal-service-token'];
    const expected = process.env.INTERNAL_SERVICE_TOKEN;

    if (!expected) {
      throw new UnauthorizedException('INTERNAL_SERVICE_TOKEN is not configured');
    }
    if (token !== expected) {
      throw new UnauthorizedException('Invalid internal service token');
    }
    return true;
  }
}
