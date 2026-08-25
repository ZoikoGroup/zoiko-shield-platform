-- Category G2 purpose-bound access. No default tenant-owner or billing role
-- receives legal-sensitive incident access; assignment is explicit.
INSERT INTO "authorization".permissions (id, code, description) VALUES (gen_random_uuid(), 'tenant:ir-legal-sensitive:read', 'Read purpose-bound legal-sensitive Incident Response references with an audited access reason') ON CONFLICT (code) DO NOTHING;
INSERT INTO "authorization".permissions (id, code, description) VALUES (gen_random_uuid(), 'tenant:ir-legal-sensitive:manage', 'Create purpose-bound legal-sensitive Incident Response references under counsel controls') ON CONFLICT (code) DO NOTHING;

INSERT INTO "authorization".roles (id, "tenantId", code, name, "roleLevel", "createdAt")
SELECT gen_random_uuid(), NULL, 'IR_LEGAL_COORDINATOR', 'Incident Response Legal Coordinator', 'TENANT', now()
WHERE NOT EXISTS (
  SELECT 1 FROM "authorization".roles role
  WHERE role.code = 'IR_LEGAL_COORDINATOR'
    AND role."roleLevel" = 'TENANT'
    AND role."tenantId" IS NULL
);

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM "authorization".roles r, "authorization".permissions p
WHERE r.code = 'IR_LEGAL_COORDINATOR' AND r."roleLevel" = 'TENANT' AND r."tenantId" IS NULL
AND p.code = 'tenant:resource:read'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM "authorization".roles r, "authorization".permissions p
WHERE r.code = 'IR_LEGAL_COORDINATOR' AND r."roleLevel" = 'TENANT' AND r."tenantId" IS NULL
AND p.code = 'tenant:ir-legal-sensitive:read'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM "authorization".roles r, "authorization".permissions p
WHERE r.code = 'IR_LEGAL_COORDINATOR' AND r."roleLevel" = 'TENANT' AND r."tenantId" IS NULL
AND p.code = 'tenant:ir-legal-sensitive:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;
