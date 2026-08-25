-- Category B4-B6 platform-plane authorities. Readiness verification is kept
-- separate from customer commercial approval. Concession makers and approvers
-- are also independently permissioned.
INSERT INTO "authorization".permissions (id, code, description) VALUES (gen_random_uuid(), 'platform:commercial-readiness:verify', 'Verify deployment, claim and service-capacity readiness and apply approved subscription changes') ON CONFLICT (code) DO NOTHING;
INSERT INTO "authorization".permissions (id, code, description) VALUES (gen_random_uuid(), 'platform:concession:manage', 'Request and operate bounded commercial concessions') ON CONFLICT (code) DO NOTHING;
INSERT INTO "authorization".permissions (id, code, description) VALUES (gen_random_uuid(), 'platform:concession:approve', 'Independently approve or reject bounded commercial concessions') ON CONFLICT (code) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM "authorization".roles r, "authorization".permissions p
WHERE r.code IN ('PLATFORM_OWNER', 'PLATFORM_SUPER_ADMIN') AND r."roleLevel" = 'PLATFORM'
AND p.code = 'platform:commercial-readiness:verify'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM "authorization".roles r, "authorization".permissions p
WHERE r.code IN ('PLATFORM_OWNER', 'PLATFORM_SUPER_ADMIN') AND r."roleLevel" = 'PLATFORM'
AND p.code = 'platform:concession:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM "authorization".roles r, "authorization".permissions p
WHERE r.code IN ('PLATFORM_OWNER', 'PLATFORM_SUPER_ADMIN') AND r."roleLevel" = 'PLATFORM'
AND p.code = 'platform:concession:approve'
ON CONFLICT (role_id, permission_id) DO NOTHING;
