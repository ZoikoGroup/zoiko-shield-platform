-- Category B1-B3: catalog and pre-production commercial programmes are
-- platform-plane operations. Finance/Commercial approval is deliberately a
-- separate permission so catalog makers cannot approve their own prices.
INSERT INTO "authorization".permissions (id, code, description)
VALUES
  (
    gen_random_uuid(),
    'platform:catalog:manage',
    'Manage catalog versions, stable products, bundle rules and governed evaluation programmes'
  ),
  (
    gen_random_uuid(),
    'platform:price:approve',
    'Independently approve prices and time-bound evaluation programme commercial terms'
  )
ON CONFLICT (code) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code IN ('platform:catalog:manage', 'platform:price:approve')
WHERE role.code IN ('PLATFORM_OWNER', 'PLATFORM_SUPER_ADMIN')
  AND role."roleLevel" = 'PLATFORM'
ON CONFLICT (role_id, permission_id) DO NOTHING;

