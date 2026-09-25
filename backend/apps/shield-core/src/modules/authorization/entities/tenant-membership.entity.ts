import type { TenantMembership as TenantMembershipRow } from '@prisma/client';
import type { Role, RoleWithPermissions } from './role.entity';

export type MembershipStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REMOVED';

/**
 * Row of "authorization".tenant_memberships, persisted through Prisma.
 * `source` is "INVITATION" | "SCIM" | "BOOTSTRAP" | "JIT_ELEVATION": how the
 * membership was established. `roles` is present when loaded through
 * "authorization".user_roles.
 */
export type TenantMembership = Omit<TenantMembershipRow, 'status'> & {
  status: MembershipStatus;
  roles?: Role[];
};

/** A membership with its roles loaded. */
export type TenantMembershipWithRoles = TenantMembership & { roles: Role[] };

/** A membership with its roles and their permissions loaded. */
export type TenantMembershipWithPermissions = TenantMembership & {
  roles: RoleWithPermissions[];
};
