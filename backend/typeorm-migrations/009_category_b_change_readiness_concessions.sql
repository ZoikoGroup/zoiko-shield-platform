-- Category B4-B6 platform-plane authorities. Readiness verification is kept
-- separate from customer commercial approval; concession makers and approvers
-- are also independently permissioned.
INSERT INTO "authorization".permissions (id, code, description)
VALUES
  (
    gen_random_uuid(),
    'platform:commercial-readiness:verify',
    'Verify deployment, claim and service-capacity readiness and apply approved subscription changes'
  ),
  (
    gen_random_uuid(),
    'platform:concession:manage',
    'Request and operate bounded commercial concessions'
  ),
  (
    gen_random_uuid(),
    'platform:concession:approve',
    'Independently approve or reject bounded commercial concessions'
  )
ON CONFLICT (code) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code IN (
    'platform:commercial-readiness:verify',
    'platform:concession:manage',
    'platform:concession:approve'
  )
WHERE role.code IN ('PLATFORM_OWNER', 'PLATFORM_SUPER_ADMIN')
  AND role."roleLevel" = 'PLATFORM'
ON CONFLICT (role_id, permission_id) DO NOTHING;

