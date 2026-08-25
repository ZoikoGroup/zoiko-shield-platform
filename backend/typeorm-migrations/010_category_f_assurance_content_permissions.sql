-- Category F platform-plane maker/checker permissions for governed framework
-- and sector-pack content releases.
INSERT INTO "authorization".permissions (id, code, description) VALUES (gen_random_uuid(), 'platform:assurance-content:manage', 'Create and submit governed framework and sector-pack content releases') ON CONFLICT (code) DO NOTHING;
INSERT INTO "authorization".permissions (id, code, description) VALUES (gen_random_uuid(), 'platform:assurance-content:approve', 'Independently approve or reject governed framework and sector-pack content releases') ON CONFLICT (code) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM "authorization".roles r, "authorization".permissions p
WHERE r.code IN ('PLATFORM_OWNER', 'PLATFORM_SUPER_ADMIN') AND r."roleLevel" = 'PLATFORM'
AND p.code = 'platform:assurance-content:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM "authorization".roles r, "authorization".permissions p
WHERE r.code IN ('PLATFORM_OWNER', 'PLATFORM_SUPER_ADMIN') AND r."roleLevel" = 'PLATFORM'
AND p.code = 'platform:assurance-content:approve'
ON CONFLICT (role_id, permission_id) DO NOTHING;
