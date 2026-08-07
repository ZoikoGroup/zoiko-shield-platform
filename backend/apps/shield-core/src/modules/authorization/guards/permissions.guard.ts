import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationService } from '../authorization.service';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../../identity-adapter/interfaces/jwt-payload.interface';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;
    const tenantId = request.headers['x-tenant-id'];
    if (!user || !tenantId || typeof tenantId !== 'string') {
      throw new ForbiddenException('X-Tenant-Id header and authentication are required');
    }

    const grantedPermissions = await this.authorizationService.getPermissionCodesForUser(
      tenantId,
      user.id,
    );
    const hasAll = requiredPermissions.every((permission) => grantedPermissions.includes(permission));
    if (!hasAll) {
      throw new ForbiddenException('Insufficient tenant permissions');
    }
    return true;
  }
}
