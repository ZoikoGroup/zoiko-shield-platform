-- Category G professional-service delivery is explicitly permissioned.
INSERT INTO "authorization".permissions (id, code, description) VALUES (gen_random_uuid(), 'tenant:professional-service:read', 'Read tenant-bound professional-service SOWs, consumption, deliverables and acceptance evidence') ON CONFLICT (code) DO NOTHING;
INSERT INTO "authorization".permissions (id, code, description) VALUES (gen_random_uuid(), 'tenant:professional-service:manage', 'Create and deliver tenant-bound governed professional-service engagements') ON CONFLICT (code) DO NOTHING;
INSERT INTO "authorization".permissions (id, code, description) VALUES (gen_random_uuid(), 'tenant:professional-service:approve', 'Approve professional-service profiles and record named customer acceptance decisions') ON CONFLICT (code) DO NOTHING;

INSERT INTO "authorization".roles (id, "tenantId", code, name, "roleLevel", "createdAt")
SELECT gen_random_uuid(), NULL, 'PROFESSIONAL_SERVICES_MANAGER', 'Professional Services Manager', 'TENANT', now()
WHERE NOT EXISTS (
  SELECT 1 FROM "authorization".roles role
  WHERE role.code = 'PROFESSIONAL_SERVICES_MANAGER'
    AND role."roleLevel" = 'TENANT'
    AND role."tenantId" IS NULL
);

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM "authorization".roles r, "authorization".permissions p
WHERE r.code = 'PROFESSIONAL_SERVICES_MANAGER' AND r."roleLevel" = 'TENANT' AND r."tenantId" IS NULL
AND p.code = 'tenant:professional-service:read'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM "authorization".roles r, "authorization".permissions p
WHERE r.code = 'PROFESSIONAL_SERVICES_MANAGER' AND r."roleLevel" = 'TENANT' AND r."tenantId" IS NULL
AND p.code = 'tenant:professional-service:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Approval is deliberately omitted from the manager template. It must be
-- assigned to an independent tenant approver to preserve maker/checker.
