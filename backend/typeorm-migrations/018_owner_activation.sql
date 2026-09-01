-- Tenant-owner bootstrap activation. Generic member invitations remain
-- TENANT_MEMBERSHIP invitations; owner invitations bind the onboarding-created
-- principal and the exact access-disclosure policy that must be accepted.
ALTER TABLE "authorization".invitations
  ADD COLUMN IF NOT EXISTS purpose varchar NOT NULL DEFAULT 'TENANT_MEMBERSHIP',
  ADD COLUMN IF NOT EXISTS "invitedPrincipalId" uuid,
  ADD COLUMN IF NOT EXISTS "policyDocumentId" uuid;

CREATE INDEX IF NOT EXISTS invitations_owner_activation_lookup
  ON "authorization".invitations ("tenantId", "invitedPrincipalId", status)
  WHERE purpose = 'OWNER_ACTIVATION';
