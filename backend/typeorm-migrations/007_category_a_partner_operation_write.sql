-- Category A4 completion: the HTTP authorization contract always requires a
-- base write capability for POST/PATCH. The shared policy decision layer then
-- requires exact delegation metadata and scope, so this capability cannot be
-- used on ordinary tenant mutation endpoints by a partner identity.
INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code = 'tenant:resource:write'
WHERE role.code = 'PARTNER_DELEGATED_OPERATOR'
  AND role."roleLevel" = 'TENANT'
ON CONFLICT (role_id, permission_id) DO NOTHING;
