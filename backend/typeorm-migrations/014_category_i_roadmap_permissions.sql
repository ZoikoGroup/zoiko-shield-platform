-- Independent platform authorities for roadmap Legal and Product decisions.
INSERT INTO "authorization".permissions (id, code, description) VALUES (gen_random_uuid(), 'platform:roadmap:legal-approve', 'Approve or reject conditional non-GA roadmap language as Legal authority') ON CONFLICT (code) DO NOTHING;
INSERT INTO "authorization".permissions (id, code, description) VALUES (gen_random_uuid(), 'platform:roadmap:product-approve', 'Approve roadmap delivery dependencies and record release-gate evidence as Product authority') ON CONFLICT (code) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM "authorization".roles r, "authorization".permissions p
WHERE r.code IN ('PLATFORM_OWNER', 'PLATFORM_SUPER_ADMIN') AND r."roleLevel" = 'PLATFORM'
AND p.code = 'platform:roadmap:legal-approve'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM "authorization".roles r, "authorization".permissions p
WHERE r.code IN ('PLATFORM_OWNER', 'PLATFORM_SUPER_ADMIN') AND r."roleLevel" = 'PLATFORM'
AND p.code = 'platform:roadmap:product-approve'
ON CONFLICT (role_id, permission_id) DO NOTHING;
