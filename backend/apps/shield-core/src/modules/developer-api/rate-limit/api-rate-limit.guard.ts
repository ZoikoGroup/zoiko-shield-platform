import { CanActivate, ExecutionContext, Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { AuthContext } from '../oauth/oauth-token.service';

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_CLIENT = 120;

/**
 * Tenant/client/route-aware in this pass at the client granularity (spec
 * §39). In-memory, single-process only — a real deployment needs a shared
 * store (Redis) for multi-instance correctness; noted as a scaling
 * limitation, not silently assumed to be production-grade. Rate limiting
 * is never treated as authorization (spec §39's own explicit rule) — this
 * guard runs after, never instead of, ApiClientAuthGuard/ApiScopeGuard.
 */
@Injectable()
export class ApiRateLimitGuard implements CanActivate {
  private readonly counters = new Map<string, { count: number; windowStart: number }>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authContext: AuthContext | undefined = request.authContext;
    const key = authContext ? `${authContext.tenantId}:${authContext.principalId}` : 'anonymous';

    const now = Date.now();
    const entry = this.counters.get(key);
    if (!entry || now - entry.windowStart > WINDOW_MS) {
      this.counters.set(key, { count: 1, windowStart: now });
      return true;
    }

    entry.count += 1;
    if (entry.count > MAX_REQUESTS_PER_CLIENT) {
      throw new HttpException({ error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded', retryable: true } }, HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
