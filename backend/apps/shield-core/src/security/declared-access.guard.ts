import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { ENDPOINT_ACCESS_KEY } from './endpoint-access.decorator';

/**
 * Build-time mistakes must fail closed at runtime: every HTTP handler either
 * declares explicit unauthenticated ingress or has at least one route/class
 * authentication or authorization guard. Declared guards still execute after
 * this global policy check.
 */
@Injectable()
export class DeclaredAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }

    const handler = context.getHandler();
    const controller = context.getClass();
    const unauthenticatedAccess = this.reflector.getAllAndOverride<string>(
      ENDPOINT_ACCESS_KEY,
      [handler, controller],
    );
    if (
      unauthenticatedAccess === 'PUBLIC' ||
      unauthenticatedAccess === 'EXTERNAL_AUTHENTICATED'
    ) {
      return true;
    }

    const declaredGuards = this.reflector.getAllAndMerge<unknown[]>(
      GUARDS_METADATA,
      [handler, controller],
    );
    if (declaredGuards.length > 0) {
      return true;
    }

    throw new ForbiddenException({
      statusCode: 403,
      error: 'ENDPOINT_ACCESS_POLICY_MISSING',
      message: 'This endpoint has no declared access policy',
    });
  }
}
