/**
 * G1-CONTRACT-01: API Contract Audit — Route-level contract invariants
 *
 * Validates that every route boundary in the platform controller stack meets
 * the three mandatory API contract invariants required by MASTER_BUILD_PLAN §11:
 *   1. All write operations (POST/PUT/PATCH/DELETE) must be guarded (JwtAuthGuard or similar).
 *   2. All tenant-scoped controllers enforce tenant route scoping.
 *   3. All controller classes carry class-level guards (defence in depth).
 *
 * This spec uses NestJS Metadata to inspect actual route metadata rather than
 * a static YAML — ensuring the live controller implementations are the source of truth.
 */
import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';

// ─── Import every tenant-scoped controller for inspection ─────────────────────
import { OffboardingController } from '../src/modules/offboarding/offboarding.controller';
import { ReconciliationController } from '../src/modules/reconciliation/reconciliation.controller';
import { TenantController } from '../src/modules/tenant/tenant.controller';
import { AuthorizationController } from '../src/modules/authorization/authorization.controller';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getControllerRoutePrefix(target: any): string {
  const meta = Reflect.getMetadata('path', target);
  if (Array.isArray(meta)) {
    return meta.join(',');
  }
  return meta ?? '';
}

function getRouteHandlers(controller: any): Array<{
  name: string;
  httpMethod: string;
  path: string;
  hasGuard: boolean;
}> {
  const prefix = getControllerRoutePrefix(controller);
  const prototype = controller.prototype;

  return Object.getOwnPropertyNames(prototype)
    .filter(
      (key) => key !== 'constructor' && typeof prototype[key] === 'function',
    )
    .map((key) => {
      const method = prototype[key];
      const httpMethod: string =
        Reflect.getMetadata('method', method) ?? 'UNKNOWN';
      const routePath: string = Reflect.getMetadata('path', method) ?? '';
      const guards: any[] = Reflect.getMetadata('__guards__', method) ?? [];
      const classGuards: any[] =
        Reflect.getMetadata('__guards__', controller) ?? [];

      return {
        name: key,
        httpMethod: String(httpMethod),
        path: `${prefix}/${routePath}`.replace(/\/+/g, '/'),
        hasGuard: guards.length > 0 || classGuards.length > 0,
      };
    })
    .filter((r) => r.httpMethod !== 'UNKNOWN');
}

// RequestMethod enum: POST=1, PUT=2, DELETE=3, PATCH=4
const WRITE_METHODS = new Set([
  RequestMethod.POST,
  RequestMethod.PUT,
  RequestMethod.DELETE,
  RequestMethod.PATCH,
  1,
  2,
  3,
  4,
]);

// ─── Controllers Under Audit ──────────────────────────────────────────────────

const ALL_AUDITED_CONTROLLERS = [
  { name: 'OffboardingController', cls: OffboardingController },
  { name: 'ReconciliationController', cls: ReconciliationController },
  { name: 'TenantController', cls: TenantController },
  { name: 'AuthorizationController', cls: AuthorizationController },
];

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('G1-CONTRACT-01: API Contract Audit — Route Invariant Verification', () => {
  describe('Invariant 1: All write operations are guarded', () => {
    for (const { name, cls } of ALL_AUDITED_CONTROLLERS) {
      it(`${name} — every POST/PUT/PATCH/DELETE handler is behind a guard`, () => {
        const routes = getRouteHandlers(cls);
        const writeRoutes = routes.filter((r) =>
          WRITE_METHODS.has(Number(r.httpMethod)),
        );
        const unguardedWrites = writeRoutes.filter((r) => !r.hasGuard);

        expect(unguardedWrites).toEqual([]);
      });
    }
  });

  describe('Invariant 2: Tenant-scoped routing hierarchy enforcement', () => {
    it('OffboardingController — sub-resource prefix contains :tenantId parameter', () => {
      const prefix = getControllerRoutePrefix(OffboardingController);
      expect(prefix).toContain(':tenantId');
    });

    it('TenantController — root prefix routes to tenant namespace', () => {
      const prefix = getControllerRoutePrefix(TenantController);
      expect(prefix).toMatch(/tenant/i);
    });
  });

  describe('Invariant 3: Controller classes carry at least one class-level guard (defence in depth)', () => {
    for (const { name, cls } of ALL_AUDITED_CONTROLLERS) {
      it(`${name} — has at least one class-level @UseGuards decorator`, () => {
        const classGuards: any[] = Reflect.getMetadata('__guards__', cls) ?? [];
        expect(classGuards.length).toBeGreaterThan(0);
      });
    }
  });

  describe('Contract summary report', () => {
    it('generates a readable audit table for the release evidence register', () => {
      const results: string[] = [
        '╔════════════════════════════════════════════════════════╗',
        '║  G1-CONTRACT-01: API Contract Audit Summary            ║',
        '╚════════════════════════════════════════════════════════╝',
      ];

      for (const { name, cls } of ALL_AUDITED_CONTROLLERS) {
        const prefix = getControllerRoutePrefix(cls);
        const classGuards: any[] = Reflect.getMetadata('__guards__', cls) ?? [];
        const routes = getRouteHandlers(cls);
        const writeRoutes = routes.filter((r) =>
          WRITE_METHODS.has(Number(r.httpMethod)),
        );
        const unguardedWrites = writeRoutes.filter((r) => !r.hasGuard);

        results.push(
          `[${name}]  prefix=${prefix}  class-guards=${classGuards.length}  ` +
            `write-routes=${writeRoutes.length}  unguarded-writes=${unguardedWrites.length}`,
        );
      }

      // Print the audit table to the Jest output
      console.log('\n' + results.join('\n') + '\n');

      // All controllers must have zero unguarded write routes
      for (const { cls } of ALL_AUDITED_CONTROLLERS) {
        const routes = getRouteHandlers(cls);
        const writeRoutes = routes.filter((r) =>
          WRITE_METHODS.has(Number(r.httpMethod)),
        );
        const unguardedWrites = writeRoutes.filter((r) => !r.hasGuard);
        expect(unguardedWrites).toHaveLength(0);
      }
    });
  });
});
