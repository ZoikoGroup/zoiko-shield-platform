-- Category F platform-plane maker/checker permissions for governed framework
-- and sector-pack content releases.
INSERT INTO "authorization".permissions (id, code, description)
VALUES
  (
    gen_random_uuid(),
    'platform:assurance-content:manage',
    'Create and submit governed framework and sector-pack content releases'
  ),
  (
    gen_random_uuid(),
    'platform:assurance-content:approve',
    'Independently approve or reject governed framework and sector-pack content releases'
  )
ON CONFLICT (code) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code IN (
    'platform:assurance-content:manage',
    'platform:assurance-content:approve'
  )
WHERE role.code IN ('PLATFORM_OWNER', 'PLATFORM_SUPER_ADMIN')
  AND role."roleLevel" = 'PLATFORM'
ON CONFLICT (role_id, permission_id) DO NOTHING;
