import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationService } from '../authorization.service';
import { PLATFORM_PERMISSIONS_KEY } from '../decorators/require-platform-permissions.decorator';
import { PLATFORM_SCOPE } from '../constants';
import type { AuthenticatedUser } from '../../identity-adapter/interfaces/jwt-payload.interface';

@Injectable()
export class PlatformPermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PLATFORM_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    const grantedPermissions = await this.authorizationService.getPermissionCodesForPrincipal(
      PLATFORM_SCOPE,
      user.id,
    );
    const hasAll = requiredPermissions.every((permission) => grantedPermissions.includes(permission));
    if (!hasAll) {
      throw new ForbiddenException('Insufficient platform permissions');
    }
    return true;
  }
}
