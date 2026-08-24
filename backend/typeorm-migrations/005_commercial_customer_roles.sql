INSERT INTO "authorization".permissions (id, code, description)
VALUES
  (
    gen_random_uuid(),
    'tenant:commercial-account:manage',
    'Request and apply approved changes to a tenant-bound commercial account'
  ),
  (
    gen_random_uuid(),
    'tenant:commercial-account:approve',
    'Independently approve or reject tenant-bound commercial account changes'
  ),
  (
    gen_random_uuid(),
    'tenant:payment:create',
    'Pay an issued invoice using an approved account payment-method reference'
  ),
  (
    gen_random_uuid(),
    'tenant:refund:manage',
    'Issue a governed refund for a tenant-visible payment'
  )
ON CONFLICT (code) DO NOTHING;

INSERT INTO "authorization".roles (
  id, "tenantId", code, name, "roleLevel", "createdAt"
)
SELECT
  gen_random_uuid(), NULL, seed.code, seed.name, 'TENANT', now()
FROM (
  VALUES
    ('COMMERCIAL_ACCOUNT_OWNER', 'Commercial Account Owner'),
    ('BILLING_ADMIN', 'Billing Admin'),
    ('COMMERCIAL_APPROVER', 'Commercial Approver')
) AS seed(code, name)
WHERE NOT EXISTS (
  SELECT 1
  FROM "authorization".roles role
  WHERE role.code = seed.code
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
    'tenant:commercial-account:read',
    'tenant:commercial-account:manage',
    'tenant:commercial-account:approve',
    'tenant:payment:create'
  )
WHERE role.code = 'COMMERCIAL_ACCOUNT_OWNER'
  AND role."roleLevel" = 'TENANT'
  AND role."tenantId" IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code IN (
    'tenant:resource:read',
    'tenant:resource:write',
    'tenant:commercial-account:read',
    'tenant:commercial-account:manage',
    'tenant:payment:create'
  )
WHERE role.code = 'BILLING_ADMIN'
  AND role."roleLevel" = 'TENANT'
  AND role."tenantId" IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code IN (
    'tenant:resource:read',
    'tenant:resource:write',
    'tenant:commercial-account:read',
    'tenant:commercial-account:approve'
  )
WHERE role.code = 'COMMERCIAL_APPROVER'
  AND role."roleLevel" = 'TENANT'
  AND role."tenantId" IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;
