-- Backfill deletion request authority for tenant-owner roles created before
-- the cross-cutting privacy workflow was introduced. Approval and legal-hold
-- authority remain isolated in the privacy/legal reviewer roles.
INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code = 'deletion:request'
WHERE role.code = 'TENANT_OWNER'
  AND role."roleLevel" = 'TENANT'
ON CONFLICT (role_id, permission_id) DO NOTHING;
