-- Category I3 discount-policy makers, policy approvers, and tenant approval
-- authority tiers. A shared permission admits the endpoint; the service and
-- PostgreSQL guard enforce the required role rank recorded on each review.

INSERT INTO "authorization".permissions (id, code, description) VALUES
  (gen_random_uuid(), 'platform:discount-policy:manage', 'Create versioned service-class discount and margin escalation policies'),
  (gen_random_uuid(), 'platform:discount-policy:approve', 'Independently approve or reject discount and margin escalation policies'),
  (gen_random_uuid(), 'tenant:discount:approve', 'Approve a tenant quote discount only at the authority tier required by its frozen margin review')
ON CONFLICT (code) DO NOTHING;

INSERT INTO "authorization".roles (
  id, "tenantId", code, name, "roleLevel", "createdAt"
)
SELECT gen_random_uuid(), NULL, seed.code, seed.name, 'TENANT', now()
FROM (
  VALUES
    ('FINANCE_COMMERCIAL_APPROVER', 'Finance Commercial Approver'),
    ('EXECUTIVE_COMMERCIAL_APPROVER', 'Executive Commercial Approver')
) AS seed(code, name)
WHERE NOT EXISTS (
  SELECT 1 FROM "authorization".roles role
  WHERE role.code = seed.code AND role."roleLevel" = 'TENANT' AND role."tenantId" IS NULL
);

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code = 'tenant:discount:approve'
WHERE role.code = 'COMMERCIAL_APPROVER'
  AND role."roleLevel" = 'TENANT' AND role."tenantId" IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code IN (
    'tenant:resource:read',
    'tenant:resource:write',
    'tenant:commercial-account:read',
    'tenant:commercial-account:approve',
    'tenant:discount:approve'
  )
WHERE role.code IN ('FINANCE_COMMERCIAL_APPROVER', 'EXECUTIVE_COMMERCIAL_APPROVER')
  AND role."roleLevel" = 'TENANT' AND role."tenantId" IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code IN (
    'platform:discount-policy:manage',
    'platform:discount-policy:approve'
  )
WHERE role.code IN ('PLATFORM_OWNER', 'PLATFORM_SUPER_ADMIN')
  AND role."roleLevel" = 'PLATFORM'
ON CONFLICT (role_id, permission_id) DO NOTHING;
