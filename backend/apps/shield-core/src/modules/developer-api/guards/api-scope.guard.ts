import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SCOPES_KEY } from './require-scopes.decorator';
import { AuthContext } from '../oauth/oauth-token.service';

/** Scope alone never bypasses entitlement/policy — this is one layer among several (spec §32/§39). */
@Injectable()
export class ApiScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required =
      this.reflector.getAllAndOverride<string[]>(SCOPES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const authContext: AuthContext | undefined = request.authContext;
    const granted = authContext?.scopes ?? [];

    const missing = required.filter((s) => !granted.includes(s));
    if (missing.length > 0) {
      throw new ForbiddenException(
        `Missing required scope(s): ${missing.join(', ')}`,
      );
    }
    return true;
  }
}
