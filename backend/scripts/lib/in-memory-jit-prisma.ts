import { randomUUID } from 'crypto';
import type { PrismaService } from '../../apps/shield-core/src/prisma/prisma.service';

/**
 * In-memory stand-in for the Prisma delegates JitElevationService uses, for
 * the offline simulation scripts. Rows live in the caller's arrays so the
 * script can assert on them; updates mutate the row in place, as a re-read
 * database row would appear.
 */
export function createInMemoryJitPrisma(store: {
  jitRequests: any[];
  memberships: any[];
  roles?: any[];
  events: any[];
}): PrismaService {
  const roles = store.roles ?? [];
  const joinRoles = (membershipId: string, data: any) =>
    (data?.create ?? []).map((userRole: any) => ({
      membership_id: membershipId,
      role_id: userRole.role_id,
    }));

  const fake = {
    jitElevationRequest: {
      create: async ({ data }: any) => {
        const row = {
          id: `jit-${randomUUID()}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        store.jitRequests.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = store.jitRequests.find((r) => r.id === where.id);
        if (!row) throw new Error(`No JIT request ${where.id}`);
        return Object.assign(row, data, { updatedAt: new Date() });
      },
      findUnique: async ({ where }: any) =>
        store.jitRequests.find((r) => r.id === where.id) ?? null,
      findFirst: async ({ where }: any) =>
        store.jitRequests.find(
          (r) =>
            r.superAdminPrincipalId === where.superAdminPrincipalId &&
            r.targetTenantId === where.targetTenantId &&
            r.status === where.status &&
            (!where.expiresAt?.gt ||
              (r.expiresAt !== null && r.expiresAt > where.expiresAt.gt)),
        ) ?? null,
      findMany: async ({ where }: any) => {
        if (where.targetTenantId) {
          return store.jitRequests.filter(
            (r) => r.targetTenantId === where.targetTenantId,
          );
        }
        if (where.status === 'APPROVED') {
          return store.jitRequests.filter(
            (r) =>
              r.status === 'APPROVED' &&
              r.expiresAt &&
              r.expiresAt <= where.expiresAt.lte,
          );
        }
        return store.jitRequests;
      },
    },
    tenantMembership: {
      create: async ({ data }: any) => {
        const id = `mem-${randomUUID()}`;
        const { roles: roleData, ...fields } = data;
        const row = {
          id,
          ...fields,
          roles: joinRoles(id, roleData),
          joinedAt: new Date(),
        };
        store.memberships.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = store.memberships.find((m) => m.id === where.id);
        if (!row) throw new Error(`No membership ${where.id}`);
        const { roles: roleData, ...fields } = data;
        Object.assign(row, fields);
        if (roleData)
          row.roles = [...(row.roles ?? []), ...joinRoles(row.id, roleData)];
        return row;
      },
      findUnique: async ({ where }: any) => {
        if (where.id)
          return store.memberships.find((m) => m.id === where.id) ?? null;
        const key = where.tenantId_principalId;
        return (
          store.memberships.find(
            (m) =>
              m.tenantId === key.tenantId && m.principalId === key.principalId,
          ) ?? null
        );
      },
    },
    role: {
      create: async ({ data }: any) => {
        const row = {
          id: `role-${randomUUID()}`,
          ...data,
          createdAt: new Date(),
        };
        roles.push(row);
        return row;
      },
      findFirst: async () =>
        roles[0] ?? {
          id: 'role-analyst',
          tenantId: null,
          code: 'TENANT_SECURITY_ANALYST',
          name: 'Tenant Security Analyst',
          roleLevel: 'TENANT',
          createdAt: new Date(),
        },
    },
    identityEvent: {
      create: async ({ data }: any) => {
        const row = {
          id: `evt-${randomUUID()}`,
          ...data,
          occurredAt: new Date(),
        };
        store.events.push(row);
        return row;
      },
    },
  };
  return fake as unknown as PrismaService;
}
