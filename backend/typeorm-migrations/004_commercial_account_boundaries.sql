INSERT INTO "authorization".permissions (id, code, description)
VALUES
  (
    gen_random_uuid(),
    'platform:commercial-account:manage',
    'Create commercial accounts and govern tenant/environment bindings'
  ),
  (
    gen_random_uuid(),
    'tenant:commercial-account:read',
    'Read the commercial accounts explicitly bound to the current tenant'
  )
ON CONFLICT (code) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code = 'platform:commercial-account:manage'
WHERE role.code = 'PLATFORM_OWNER'
  AND role."roleLevel" = 'PLATFORM'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code = 'tenant:commercial-account:read'
WHERE role.code = 'TENANT_OWNER'
  AND role."roleLevel" = 'TENANT'
ON CONFLICT (role_id, permission_id) DO NOTHING;
