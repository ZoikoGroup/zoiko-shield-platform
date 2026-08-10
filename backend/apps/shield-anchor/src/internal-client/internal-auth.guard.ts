import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

/** Same shared-secret service-to-service guard as shield-ai/shield-core's internal endpoints. */
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
