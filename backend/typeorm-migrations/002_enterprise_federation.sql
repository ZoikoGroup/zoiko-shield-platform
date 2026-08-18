-- Enterprise federation and tenant-bound sessions (IAM §§5, 8, 10, 19, 22).
-- Existing sessions were issued without an authoritative tenant membership;
-- revoke them during the additive migration so they cannot be upgraded by
-- presenting an old refresh token.

ALTER TABLE "identity".sessions
  ADD COLUMN IF NOT EXISTS "tenantId" uuid,
  ADD COLUMN IF NOT EXISTS "membershipId" uuid,
  ADD COLUMN IF NOT EXISTS "environmentId" uuid,
  ADD COLUMN IF NOT EXISTS region varchar,
  ADD COLUMN IF NOT EXISTS "authenticationMethod" varchar,
  ADD COLUMN IF NOT EXISTS issuer text,
  ADD COLUMN IF NOT EXISTS "policyVersion" varchar NOT NULL DEFAULT 'iam-policy-1.0.0',
  ADD COLUMN IF NOT EXISTS "riskState" varchar NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS state varchar NOT NULL DEFAULT 'ACTIVE';

UPDATE "identity".sessions
SET "revokedAt" = COALESCE("revokedAt", now()),
    "revokedReason" = COALESCE("revokedReason", 'TENANT_BINDING_MIGRATION')
WHERE "tenantId" IS NULL OR "membershipId" IS NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_tenant
  ON "identity".sessions ("tenantId");
CREATE INDEX IF NOT EXISTS idx_sessions_membership
  ON "identity".sessions ("membershipId");

ALTER TABLE "identity".sessions
  ADD CONSTRAINT sessions_active_tenant_binding_check
  CHECK (
    ("tenantId" IS NOT NULL AND "membershipId" IS NOT NULL)
    OR "revokedAt" IS NOT NULL
  );

ALTER TABLE "identity".sessions
  ADD CONSTRAINT sessions_state_check
  CHECK (state IN ('ACTIVE', 'RESTRICTED'));

CREATE TABLE IF NOT EXISTS "identity".identity_provider_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" uuid NOT NULL REFERENCES "tenant".tenants(id) ON DELETE CASCADE,
  "environmentId" uuid NOT NULL REFERENCES "tenant".environments(id) ON DELETE RESTRICT,
  name varchar(160) NOT NULL,
  protocol varchar NOT NULL CHECK (protocol IN ('OIDC', 'SAML')),
  status varchar NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'DISABLED')),
  issuer text NOT NULL,
  "clientId" varchar,
  "clientSecretRef" varchar,
  "oidcClientAuthMethod" varchar,
  "oidcMetadata" jsonb,
  "oidcSigningAlgorithm" varchar,
  "samlEntryPoint" text,
  "samlIdpCertificates" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "samlSpEntityId" varchar,
  "samlSpPrivateKeyRef" varchar,
  "samlSpPublicCertificate" text,
  "emailClaim" varchar NOT NULL DEFAULT 'email',
  "displayNameClaim" varchar NOT NULL DEFAULT 'name',
  "groupsClaim" varchar,
  "mfaClaimValues" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "requireMfa" boolean NOT NULL DEFAULT false,
  "allowedClockSkewMs" integer NOT NULL DEFAULT 120000,
  "metadataHash" varchar,
  "metadataValidatedAt" timestamptz,
  "createdByPrincipalId" uuid NOT NULL REFERENCES "identity".principals(id) ON DELETE RESTRICT,
  "updatedByPrincipalId" uuid NOT NULL REFERENCES "identity".principals(id) ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenantId", name),
  CHECK ("allowedClockSkewMs" BETWEEN 0 AND 300000)
);

ALTER TABLE "identity".identity_provider_configurations
  ADD COLUMN IF NOT EXISTS "mfaClaimValues" jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_identity_provider_config_tenant
  ON "identity".identity_provider_configurations ("tenantId");

CREATE TABLE IF NOT EXISTS "identity".federation_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "stateHash" varchar NOT NULL UNIQUE,
  "identityProviderConfigurationId" uuid NOT NULL
    REFERENCES "identity".identity_provider_configurations(id) ON DELETE CASCADE,
  "tenantId" uuid NOT NULL REFERENCES "tenant".tenants(id) ON DELETE CASCADE,
  "environmentId" uuid NOT NULL REFERENCES "tenant".environments(id) ON DELETE CASCADE,
  protocol varchar NOT NULL CHECK (protocol IN ('OIDC', 'SAML')),
  "encryptedPayload" text NOT NULL,
  "requestIp" varchar,
  "requestUserAgent" text,
  "expiresAt" timestamptz NOT NULL,
  "consumedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_federation_transactions_provider
  ON "identity".federation_transactions ("identityProviderConfigurationId");
CREATE INDEX IF NOT EXISTS idx_federation_transactions_tenant
  ON "identity".federation_transactions ("tenantId");

CREATE TABLE IF NOT EXISTS "identity".saml_request_cache (
  "keyHash" varchar PRIMARY KEY,
  value text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "identity".external_identity_tenant_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "externalIdentityId" uuid NOT NULL
    REFERENCES "identity".external_identities(id) ON DELETE CASCADE,
  "tenantId" uuid NOT NULL REFERENCES "tenant".tenants(id) ON DELETE CASCADE,
  "identityProviderConfigurationId" uuid NOT NULL
    REFERENCES "identity".identity_provider_configurations(id) ON DELETE RESTRICT,
  status varchar NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  "lastAuthenticatedAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("externalIdentityId", "tenantId")
);

CREATE INDEX IF NOT EXISTS idx_external_identity_tenant_binding_tenant
  ON "identity".external_identity_tenant_bindings ("tenantId");

INSERT INTO "authorization".permissions (id, code, description)
VALUES (
  gen_random_uuid(),
  'tenant:identity-provider:manage',
  'Create, validate, activate, change and disable tenant identity providers'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code = 'tenant:identity-provider:manage'
WHERE role.code = 'TENANT_OWNER' AND role."roleLevel" = 'TENANT'
ON CONFLICT DO NOTHING;
