-- Cross-cutting privacy/legal permissions are intentionally separate from
-- ordinary tenant CRUD. Requesters cannot approve their own erasure request.
INSERT INTO "authorization".permissions (id, code, description)
VALUES
  (gen_random_uuid(), 'deletion:request', 'Submit a tenant-bound data deletion request'),
  (gen_random_uuid(), 'deletion:approve', 'Approve or reject a deletion request after identity, scope, retention and legal-hold review'),
  (gen_random_uuid(), 'legal_hold:create', 'Create a scoped legal hold that suspends conflicting deletion')
ON CONFLICT (code) DO NOTHING;

INSERT INTO "authorization".roles (id, "tenantId", code, name, "roleLevel", "createdAt")
SELECT gen_random_uuid(), NULL, 'PRIVACY_LEGAL_REVIEWER', 'Privacy and Legal Reviewer', 'TENANT', now()
WHERE NOT EXISTS (
  SELECT 1 FROM "authorization".roles role
  WHERE role.code = 'PRIVACY_LEGAL_REVIEWER'
    AND role."roleLevel" = 'TENANT'
    AND role."tenantId" IS NULL
);

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code IN (
    'tenant:resource:read',
    'tenant:resource:write',
    'deletion:approve',
    'legal_hold:create'
  )
WHERE role.code = 'PRIVACY_LEGAL_REVIEWER'
  AND role."roleLevel" = 'TENANT'
  AND role."tenantId" IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO "authorization".roles (id, "tenantId", code, name, "roleLevel", "createdAt")
SELECT gen_random_uuid(), NULL, 'PLATFORM_PRIVACY_LEGAL_REVIEWER', 'Platform Privacy and Legal Reviewer', 'PLATFORM', now()
WHERE NOT EXISTS (
  SELECT 1 FROM "authorization".roles role
  WHERE role.code = 'PLATFORM_PRIVACY_LEGAL_REVIEWER'
    AND role."roleLevel" = 'PLATFORM'
    AND role."tenantId" IS NULL
);

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code IN (
    'deletion:request',
    'deletion:approve',
    'legal_hold:create'
  )
WHERE role.code = 'PLATFORM_PRIVACY_LEGAL_REVIEWER'
  AND role."roleLevel" = 'PLATFORM'
  AND role."tenantId" IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Tenant owners may submit deletion/offboarding requests, but legal hold and
-- approval authority must be explicitly assigned through the reviewer role.
DELETE FROM "authorization".role_permissions role_permission
USING "authorization".roles role, "authorization".permissions permission
WHERE role_permission.role_id = role.id
  AND role_permission.permission_id = permission.id
  AND role.code = 'TENANT_OWNER'
  AND role."roleLevel" = 'TENANT'
  AND permission.code IN ('deletion:approve', 'legal_hold:create');
