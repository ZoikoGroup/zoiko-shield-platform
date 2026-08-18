import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../../identity-adapter/interfaces/jwt-payload.interface';
import { PERMISSION_CODES, PLATFORM_SCOPE } from '../constants';
import { PLATFORM_PERMISSIONS_KEY } from '../decorators/require-platform-permissions.decorator';
import {
  assertPermittedAuthorization,
  AuthorizationDecisionService,
} from '../../authorization-decision/authorization-decision.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorizationDecisionService: AuthorizationDecisionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const declaredPermissions = this.reflector.getAllAndMerge<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const platformPermissions = this.reflector.getAllAndOverride<string[]>(
      PLATFORM_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;
    if (!user) {
      throw new ForbiddenException('Authentication is required');
    }
    if (user.sessionState === 'RESTRICTED') {
      throw new ForbiddenException(
        'SESSION_RESTRICTED: This operation is not available in the bounded session state',
      );
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
    const suppliedTenantId = distinctTenantIds[0];
    const tenantId = user.tenantId;

    if (suppliedTenantId === 'default-tenant') {
      throw new BadRequestException(
        "'default-tenant' is not a valid tenant identifier",
      );
    }

    if (suppliedTenantId && suppliedTenantId !== tenantId) {
      throw new ForbiddenException(
        'The requested tenant does not match the tenant-bound session',
      );
    }

    if (!tenantId) {
      throw new ForbiddenException('The session has no tenant binding');
    }

    request.headers['x-tenant-id'] = tenantId;
    request.tenantId = tenantId;

    // A method-level PlatformPermissionsGuard is the sole PDP for an explicit
    // platform operation; do not also require customer-tenant base actions.
    if (platformPermissions?.length && tenantId === PLATFORM_SCOPE) {
      return true;
    }

    const read = ['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    const basePermission = read
      ? PERMISSION_CODES.TENANT_RESOURCE_READ
      : PERMISSION_CODES.TENANT_RESOURCE_WRITE;
    const requiredPermissions = [
      ...new Set([basePermission, ...(declaredPermissions ?? [])]),
    ];
    const action =
      declaredPermissions?.find(
        (permission) => !permission.startsWith('tenant:resource:'),
      ) ?? basePermission;
    const resourceId = Object.entries(request.params ?? {}).find(
      ([key, value]) =>
        key !== 'tenantId' && typeof value === 'string' && value.length > 0,
    )?.[1] as string | undefined;
    const correlationHeader =
      request.headers['x-correlation-id'] ?? request.headers['x-request-id'];
    const result = await this.authorizationDecisionService.evaluate({
      actorId: user.id,
      tenantId,
      environmentId: user.environmentId,
      action,
      effectClass: read ? 'READ' : 'WRITE',
      resourceType: context.getClass().name.replace(/Controller$/, ''),
      resourceId,
      resourceTenantId: tenantId,
      purpose:
        typeof request.headers['x-purpose'] === 'string'
          ? request.headers['x-purpose']
          : 'interactive-api',
      requiredPermissions,
      assurance: user.assurance,
      riskState: user.riskState,
      policyVersion: user.policyVersion,
      correlationId:
        typeof correlationHeader === 'string' ? correlationHeader : undefined,
    });

    request.authorizationDecision = result;
    assertPermittedAuthorization(result);
    return true;
  }
}
