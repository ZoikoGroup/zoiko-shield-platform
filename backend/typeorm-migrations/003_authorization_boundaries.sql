INSERT INTO "authorization".permissions (id, code, description)
VALUES
  (
    gen_random_uuid(),
    'platform:tenant:onboard',
    'Provision a tenant from an approved commercial order'
  ),
  (
    gen_random_uuid(),
    'platform:meter-definition:manage',
    'Create and approve global meter definitions'
  ),
  (
    gen_random_uuid(),
    'platform:sla-definition:manage',
    'Create and approve global SLA definitions'
  ),
  (
    gen_random_uuid(),
    'platform:resource-definition:manage',
    'Create and approve global protected-resource definitions'
  ),
  (
    gen_random_uuid(),
    'tenant:resource:read',
    'Read tenant resources through a policy enforcement point'
  ),
  (
    gen_random_uuid(),
    'tenant:resource:write',
    'Create or modify tenant resources through a policy enforcement point'
  )
ON CONFLICT (code) DO NOTHING;

-- Existing PLATFORM_OWNER roles receive the newly introduced platform
-- capabilities. Deployments using differently named platform roles must grant
-- these permissions through the governed role-management workflow.
INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code IN (
    'platform:tenant:onboard',
    'platform:meter-definition:manage',
    'platform:sla-definition:manage',
    'platform:resource-definition:manage'
  )
WHERE role.code = 'PLATFORM_OWNER'
  AND role."roleLevel" = 'PLATFORM'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code IN (
    'tenant:resource:read',
    'tenant:resource:write'
  )
WHERE role.code = 'TENANT_OWNER'
  AND role."roleLevel" = 'TENANT'
ON CONFLICT (role_id, permission_id) DO NOTHING;
