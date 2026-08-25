-- Category H AI commercial policy, visibility and maker/checker authority.
INSERT INTO "authorization".permissions (id, code, description) VALUES (gen_random_uuid(), 'tenant:ai-governance:read', 'Read tenant AI governance profiles, allowance forecasts, runtime state and provider-cost events') ON CONFLICT (code) DO NOTHING;
INSERT INTO "authorization".permissions (id, code, description) VALUES (gen_random_uuid(), 'tenant:ai-governance:manage', 'Create and activate tenant-bound AI governance profiles and internal spend budgets') ON CONFLICT (code) DO NOTHING;
INSERT INTO "authorization".permissions (id, code, description) VALUES (gen_random_uuid(), 'tenant:ai-governance:approve', 'Independently approve or reject AI commercial, metering and provider-fallback policy') ON CONFLICT (code) DO NOTHING;

INSERT INTO "authorization".roles (id, "tenantId", code, name, "roleLevel", "createdAt")
SELECT gen_random_uuid(), NULL, 'AI_GOVERNANCE_MANAGER', 'AI Governance Manager', 'TENANT', now()
WHERE NOT EXISTS (
  SELECT 1 FROM "authorization".roles role
  WHERE role.code = 'AI_GOVERNANCE_MANAGER'
    AND role."roleLevel" = 'TENANT'
    AND role."tenantId" IS NULL
);

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM "authorization".roles r, "authorization".permissions p
WHERE r.code = 'AI_GOVERNANCE_MANAGER' AND r."roleLevel" = 'TENANT' AND r."tenantId" IS NULL
AND p.code = 'tenant:ai-governance:read'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM "authorization".roles r, "authorization".permissions p
WHERE r.code = 'AI_GOVERNANCE_MANAGER' AND r."roleLevel" = 'TENANT' AND r."tenantId" IS NULL
AND p.code = 'tenant:ai-governance:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Approval is intentionally omitted from the manager template. It must be
-- granted to an independent tenant approver for maker/checker separation.
