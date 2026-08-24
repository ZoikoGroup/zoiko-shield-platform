import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PLATFORM_PERMISSIONS_KEY } from '../decorators/require-platform-permissions.decorator';
import { REQUIRED_ASSURANCE_KEY } from '../decorators/require-assurance.decorator';
import { PLATFORM_SCOPE } from '../constants';
import type { AuthenticatedUser } from '../../identity-adapter/interfaces/jwt-payload.interface';
import type { Assurance } from '../../identity-adapter/session.entity';
import {
  assertPermittedAuthorization,
  AuthorizationDecisionService,
} from '../../authorization-decision/authorization-decision.service';

@Injectable()
export class PlatformPermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorizationDecisionService: AuthorizationDecisionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PLATFORM_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredPermissions || requiredPermissions.length === 0) {
      throw new ForbiddenException(
        'Platform operation has no declared platform permission',
      );
    }
    const requiredAssurance = this.reflector.getAllAndOverride<Assurance[]>(
      REQUIRED_ASSURANCE_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      method: string;
      params?: Record<string, unknown>;
      headers: Record<string, string | string[] | undefined>;
      authorizationDecision?: unknown;
    }>();
    const user: AuthenticatedUser | undefined = request.user;
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }
    if (user.tenantId !== PLATFORM_SCOPE) {
      throw new ForbiddenException(
        'Platform operations require a platform-scoped session',
      );
    }

    const read = ['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    const resourceId = Object.values(request.params ?? {}).find(
      (value) => typeof value === 'string' && value.length > 0,
    ) as string | undefined;
    const result = await this.authorizationDecisionService.evaluate({
      actorId: user.id,
      tenantId: PLATFORM_SCOPE,
      environmentId: user.environmentId,
      action: requiredPermissions[0],
      effectClass: read ? 'READ' : 'PRIVILEGED',
      resourceType: context.getClass().name.replace(/Controller$/, ''),
      resourceId,
      resourceTenantId: PLATFORM_SCOPE,
      purpose: 'platform-administration',
      requiredPermissions,
      requiredAssurance,
      assurance: user.assurance,
      riskState: user.riskState,
      policyVersion: user.policyVersion,
      correlationId:
        typeof request.headers['x-correlation-id'] === 'string'
          ? request.headers['x-correlation-id']
          : undefined,
    });
    request.authorizationDecision = result;
    assertPermittedAuthorization(result);
    return true;
  }
}
