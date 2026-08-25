INSERT INTO "authorization".permissions (id, code, description)
VALUES
  (
    gen_random_uuid(),
    'tenant:partner-delegation:read',
    'Read explicit partner access grants visible to the current customer tenant'
  ),
  (
    gen_random_uuid(),
    'tenant:partner-delegation:manage',
    'Grant and revoke expiring operational partner access for the current customer tenant'
  ),
  (
    gen_random_uuid(),
    'tenant:partner-delegation:use',
    'Evaluate the authenticated partner principal against its explicit customer grant'
  ),
  (
    gen_random_uuid(),
    'tenant:corporate-transfer:manage',
    'Request and execute an approved subsidiary or business-unit transfer plan'
  ),
  (
    gen_random_uuid(),
    'tenant:corporate-transfer:approve',
    'Independently approve and reconcile a subsidiary or business-unit transfer plan'
  )
ON CONFLICT (code) DO NOTHING;

INSERT INTO "authorization".roles (
  id, "tenantId", code, name, "roleLevel", "createdAt"
)
SELECT
  gen_random_uuid(), NULL, 'PARTNER_DELEGATED_OPERATOR',
  'Partner Delegated Operator', 'TENANT', now()
WHERE NOT EXISTS (
  SELECT 1
  FROM "authorization".roles role
  WHERE role.code = 'PARTNER_DELEGATED_OPERATOR'
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
    'tenant:partner-delegation:use'
  )
WHERE role.code = 'PARTNER_DELEGATED_OPERATOR'
  AND role."roleLevel" = 'TENANT'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code IN (
    'tenant:partner-delegation:read',
    'tenant:partner-delegation:manage',
    'tenant:corporate-transfer:manage',
    'tenant:corporate-transfer:approve'
  )
WHERE role.code = 'TENANT_OWNER'
  AND role."roleLevel" = 'TENANT'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code IN (
    'tenant:corporate-transfer:manage',
    'tenant:corporate-transfer:approve'
  )
WHERE role.code = 'COMMERCIAL_ACCOUNT_OWNER'
  AND role."roleLevel" = 'TENANT'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code = 'tenant:corporate-transfer:manage'
WHERE role.code = 'BILLING_ADMIN'
  AND role."roleLevel" = 'TENANT'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code = 'tenant:corporate-transfer:approve'
WHERE role.code = 'COMMERCIAL_APPROVER'
  AND role."roleLevel" = 'TENANT'
ON CONFLICT (role_id, permission_id) DO NOTHING;
