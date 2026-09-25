import type { Role as RoleRow } from '@prisma/client';
import type { Permission } from './permission.entity';

export type RoleLevel = 'PLATFORM' | 'TENANT';

/**
 * Row of "authorization".roles, persisted through Prisma. `tenantId` is null
 * for platform-level roles and set for tenant-scoped custom roles.
 * `permissions` is present when loaded through "authorization".role_permissions.
 */
export type Role = Omit<RoleRow, 'roleLevel'> & {
  roleLevel: RoleLevel;
  permissions?: Permission[];
};

/** A role with its permissions loaded. */
export type RoleWithPermissions = Role & { permissions: Permission[] };
