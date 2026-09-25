import type {
  Prisma,
  Role as RoleRow,
  TenantMembership as TenantMembershipRow,
} from '@prisma/client';
import type { Role, RoleWithPermissions } from './entities/role.entity';
import type {
  TenantMembership,
  TenantMembershipWithPermissions,
  TenantMembershipWithRoles,
} from './entities/tenant-membership.entity';

/**
 * Prisma models the role/permission and membership/role many-to-many
 * relations through their join tables ("authorization".role_permissions and
 * "authorization".user_roles). These includes load them, and the mappers
 * below flatten the join rows back into the `Role.permissions: Permission[]`
 * and `TenantMembership.roles: Role[]` shapes that controllers and guards
 * consume.
 */
export const ROLE_WITH_PERMISSIONS_INCLUDE = {
  permissions: { include: { permission: true } },
} satisfies Prisma.RoleInclude;

export const MEMBERSHIP_WITH_ROLES_INCLUDE = {
  roles: { include: { role: true } },
} satisfies Prisma.TenantMembershipInclude;

export const MEMBERSHIP_WITH_PERMISSIONS_INCLUDE = {
  roles: { include: { role: { include: ROLE_WITH_PERMISSIONS_INCLUDE } } },
} satisfies Prisma.TenantMembershipInclude;

export type RoleRowWithPermissions = Prisma.RoleGetPayload<{
  include: typeof ROLE_WITH_PERMISSIONS_INCLUDE;
}>;
export type MembershipRowWithRoles = Prisma.TenantMembershipGetPayload<{
  include: typeof MEMBERSHIP_WITH_ROLES_INCLUDE;
}>;
export type MembershipRowWithPermissions = Prisma.TenantMembershipGetPayload<{
  include: typeof MEMBERSHIP_WITH_PERMISSIONS_INCLUDE;
}>;

export function toRole(row: RoleRow): Role {
  return row as Role;
}

export function toRoleWithPermissions(
  row: RoleRowWithPermissions,
): RoleWithPermissions {
  const { permissions, ...role } = row;
  return {
    ...toRole(role),
    permissions: permissions.map((rolePermission) => rolePermission.permission),
  };
}

export function toMembership(row: TenantMembershipRow): TenantMembership {
  return row as TenantMembership;
}

export function toMembershipWithRoles(
  row: MembershipRowWithRoles,
): TenantMembershipWithRoles {
  const { roles, ...membership } = row;
  return {
    ...toMembership(membership),
    roles: roles.map((userRole) => toRole(userRole.role)),
  };
}

export function toMembershipWithPermissions(
  row: MembershipRowWithPermissions,
): TenantMembershipWithPermissions {
  const { roles, ...membership } = row;
  return {
    ...toMembership(membership),
    roles: roles.map((userRole) => toRoleWithPermissions(userRole.role)),
  };
}
