import 'reflect-metadata';
import { AsyncLocalStorage } from 'async_hooks';
import { Logger } from '@nestjs/common';

/**
 * The tenant scope a unit of work runs in, read by TenantScopedPool on every
 * connection checkout and handed to PostgreSQL row-level security
 * (prisma/access/access-policy.js).
 *
 *   request   an HTTP request; its tenant is bound by the auth guard only
 *             after the guard has verified it. Until then it is unscoped.
 *   tenant    an explicit unit of work for one tenant (a message handler, a
 *             per-tenant step inside a platform job).
 *   platform  an explicitly declared platform-wide operation. Every entry is
 *             logged with its reason, and the database additionally requires
 *             the shield_platform_scope role.
 *
 * No scope at all means no tenant rows are visible: fail closed.
 */
export type DbScope =
  | { kind: 'request'; tenantId?: string; platformReason?: string }
  | { kind: 'tenant'; tenantId: string }
  | { kind: 'platform'; reason: string };

const storage = new AsyncLocalStorage<DbScope>();
const logger = new Logger('DbScope');

export function currentDbScope(): DbScope | undefined {
  return storage.getStore();
}

/** The values TenantScopedPool writes into the session for the current scope. */
export function sessionSettingsForCurrentScope(): {
  tenantId: string;
  platform: boolean;
  reason: string;
} {
  const scope = storage.getStore();
  if (!scope) return { tenantId: '', platform: false, reason: '' };
  switch (scope.kind) {
    case 'request':
      return scope.platformReason
        ? { tenantId: '', platform: true, reason: scope.platformReason }
        : { tenantId: scope.tenantId ?? '', platform: false, reason: '' };
    case 'tenant':
      return { tenantId: scope.tenantId, platform: false, reason: '' };
    case 'platform':
      return { tenantId: '', platform: true, reason: scope.reason };
  }
}

function assertTenantId(tenantId: string): string {
  if (typeof tenantId !== 'string' || tenantId.trim().length === 0) {
    throw new Error('A tenant scope needs a tenant identifier');
  }
  return tenantId.trim();
}

/**
 * Run fn in a scope. Prisma queries are lazy: `prisma.x.findMany()` returns a
 * thenable that only starts when something calls .then(). Returned as is, it
 * would start at the caller's `await`, after the scope has been left, and run
 * unscoped. So a thenable result is started here, inside the scope.
 */
function runIn<T>(scope: DbScope, fn: () => T): T {
  return storage.run(scope, () => {
    const result = fn();
    if (result && typeof (result as { then?: unknown }).then === 'function') {
      const thenable = result as unknown as PromiseLike<unknown>;
      return new Promise((resolve, reject) =>
        thenable.then(resolve, reject),
      ) as unknown as T;
    }
    return result;
  });
}

/** Run fn with every query scoped to one tenant. */
export function runWithTenantScope<T>(tenantId: string, fn: () => T): T {
  return runIn({ kind: 'tenant', tenantId: assertTenantId(tenantId) }, fn);
}

/**
 * Run fn as a platform-wide operation that may read and write every tenant's
 * rows. Reserve it for work that is platform-wide by nature (outbox
 * publishing, retry sweeps, cross-tenant checkpoints); prefer
 * runWithTenantScope per tenant wherever the work can be split.
 */
export function runWithPlatformScope<T>(reason: string, fn: () => T): T {
  if (typeof reason !== 'string' || reason.trim().length < 3) {
    throw new Error('Platform scope requires a stated reason');
  }
  logger.debug(`Entering platform scope: ${reason}`);
  return runIn({ kind: 'platform', reason: reason.trim() }, fn);
}

/** Start an HTTP request's scope, unbound until its tenant is verified. */
export function runInRequestScope<T>(fn: () => T): T {
  return storage.run({ kind: 'request' }, fn);
}

/**
 * Bind the verified tenant to the current request. Call it from an auth guard
 * only after the tenant has been checked against the caller's authority. A
 * request can be bound once; rebinding it to a different tenant throws.
 */
export function bindRequestTenant(tenantId: string): void {
  const scope = storage.getStore();
  if (!scope || scope.kind !== 'request') return;
  const verified = assertTenantId(tenantId);
  if (scope.tenantId && scope.tenantId !== verified) {
    throw new Error('The request is already bound to a different tenant');
  }
  scope.tenantId = verified;
}

/**
 * Elevate the current request to platform scope. Call it only after the
 * platform policy decision point has permitted an explicit platform
 * operation; the reason is recorded with every connection it uses.
 */
export function elevateRequestToPlatform(reason: string): void {
  const scope = storage.getStore();
  if (!scope || scope.kind !== 'request') return;
  if (typeof reason !== 'string' || reason.trim().length < 3) {
    throw new Error('Platform scope requires a stated reason');
  }
  logger.debug(`Request elevated to platform scope: ${reason}`);
  scope.platformReason = reason.trim();
}

/** Express/Nest middleware that gives each request its own scope. */
export function dbScopeMiddleware(
  _request: unknown,
  _response: unknown,
  next: () => void,
): void {
  runInRequestScope(next);
}

/**
 * Method decorator: run the method in platform scope. For scheduled jobs and
 * consumers that are platform-wide by nature.
 */
export function PlatformScope(reason: string): MethodDecorator {
  return (_target, _key, descriptor: PropertyDescriptor) => {
    const original = descriptor.value as (...args: unknown[]) => unknown;
    const wrapped = function (this: unknown, ...args: unknown[]) {
      return runWithPlatformScope(reason, () => original.apply(this, args));
    };
    // Keep metadata other decorators (e.g. @Cron) attached to the original,
    // so decorator order does not matter.
    for (const key of Reflect.getMetadataKeys(original)) {
      Reflect.defineMetadata(key, Reflect.getMetadata(key, original), wrapped);
    }
    Object.defineProperty(wrapped, 'name', { value: original.name });
    descriptor.value = wrapped;
    return descriptor;
  };
}
