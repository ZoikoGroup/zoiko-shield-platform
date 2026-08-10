// Sentinel "tenant" used only for platform-level (roleLevel: PLATFORM) role
// grants — catalog management (permissions, roles) is a platform capability,
// not scoped to any customer tenant. Never a real tenant row.
export const PLATFORM_SCOPE = '00000000-0000-0000-0000-000000000000';

export const PERMISSION_CODES = {
  PLATFORM_PERMISSION_MANAGE: 'platform:permission:manage',
  PLATFORM_ROLE_MANAGE: 'platform:role:manage',
  TENANT_MEMBER_INVITE: 'tenant:member:invite',
  TENANT_MANAGE: 'tenant:manage',
} as const;
