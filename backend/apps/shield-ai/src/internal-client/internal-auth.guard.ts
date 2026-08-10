import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

/**
 * Guards shield-ai's controllers against being called by anything other
 * than another ZoikoShield backend service. Shared-secret header check —
 * simplest thing that actually authenticates service-to-service calls,
 * matching the scale of every other MVP integration this session
 * (env-var-backed, not a stub, not a fake pass-through).
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
