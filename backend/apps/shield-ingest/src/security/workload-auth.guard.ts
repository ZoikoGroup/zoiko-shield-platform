import { BadRequestException, CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { verifyWorkloadToken } from '../../../../libs/security/src/workload-token';
import { PUBLIC_INGRESS_KEY } from './public-ingress.decorator';

@Injectable()
export class WorkloadAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_INGRESS_KEY, [context.getHandler(), context.getClass()])) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers.authorization;
    const token = typeof authorization === 'string' && authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    try {
      request.workloadIdentity = verifyWorkloadToken(token, 'shield-ingest');
      const candidates = [
        request.headers['x-tenant-id'],
        request.params?.tenantId,
        request.query?.tenantId,
        request.body?.tenantId,
      ].filter((value): value is string => typeof value === 'string' && value.length > 0);
      const tenantIds = [...new Set(candidates)];
      if (tenantIds.length !== 1 || tenantIds[0] === 'default-tenant') {
        throw new BadRequestException(tenantIds.length === 0
          ? 'The x-tenant-id header is required for workload-authenticated requests'
          : tenantIds[0] === 'default-tenant'
            ? "'default-tenant' is not a valid tenant identifier"
          : 'Conflicting tenant identifiers were supplied');
      }
      request.headers['x-tenant-id'] = tenantIds[0];
      request.tenantId = tenantIds[0];
      return true;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new UnauthorizedException('Invalid or expired workload identity');
    }
  }
}
