import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationService } from '../authorization.service';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../../identity-adapter/interfaces/jwt-payload.interface';
import { PLATFORM_SCOPE } from '../constants';

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
    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;
    if (!user) {
      throw new ForbiddenException('Authentication is required');
    }

    const candidates = [
      request.headers['x-tenant-id'],
      request.params?.tenantId,
      request.query?.tenantId,
      request.body?.tenantId,
    ].filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );
    const distinctTenantIds = [...new Set(candidates)];
    if (distinctTenantIds.length > 1) {
      throw new BadRequestException(
        'Conflicting tenant identifiers were supplied',
      );
    }
    const tenantId = distinctTenantIds[0];

    if (tenantId === 'default-tenant') {
      throw new BadRequestException(
        "'default-tenant' is not a valid tenant identifier",
      );
    }

    if (!tenantId) {
      if (
        requiredPermissions?.length &&
        requiredPermissions.every((permission) =>
          permission.startsWith('platform:'),
        )
      ) {
        const platformPermissions =
          await this.authorizationService.getPermissionCodesForPrincipal(
            PLATFORM_SCOPE,
            user.id,
          );
        if (
          !requiredPermissions.every((permission) =>
            platformPermissions.includes(permission),
          )
        ) {
          throw new ForbiddenException('Insufficient platform permissions');
        }
        return true;
      }
      if (context.getClass().name === 'TenantController') return true;
      throw new BadRequestException(
        'The x-tenant-id header is required for this operation',
      );
    }

    if (!(await this.authorizationService.hasTenantAccess(tenantId, user.id))) {
      throw new ForbiddenException(
        'The authenticated principal has no active membership for this tenant',
      );
    }

    request.headers['x-tenant-id'] = tenantId;
    request.tenantId = tenantId;

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const grantedPermissions =
      await this.authorizationService.getPermissionCodesForPrincipal(
        tenantId,
        user.id,
      );
    const hasAll = requiredPermissions.every((permission) =>
      grantedPermissions.includes(permission),
    );
    if (!hasAll) {
      throw new ForbiddenException('Insufficient tenant permissions');
    }
    return true;
  }
}
