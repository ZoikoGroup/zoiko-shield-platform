-- Consolidates the 20 hand-written TypeORM SQL migrations (formerly backend/typeorm-migrations/)
-- into Prisma's migration history, per ADR-002. The statements are the original files, in
-- order, unchanged. Databases that already applied them through the old runner have this
-- migration marked as applied by scripts/reconcile-typeorm-baseline.js instead of re-running it.

-- ---- 001_identity_authorization_tenant.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS "identity";
CREATE SCHEMA IF NOT EXISTS "authorization";
CREATE SCHEMA IF NOT EXISTS "tenant";

CREATE TABLE IF NOT EXISTS "identity".principals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "principalType" varchar NOT NULL DEFAULT 'HUMAN',
  status varchar NOT NULL DEFAULT 'ACTIVE',
  source varchar NOT NULL,
  "riskState" varchar NOT NULL DEFAULT 'NORMAL',
  email varchar UNIQUE,
  "fullName" varchar,
  "avatarUrl" text,
  "emailVerified" boolean NOT NULL DEFAULT false,
  "lastLoginAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "terminatedAt" timestamptz
);

CREATE TABLE IF NOT EXISTS "identity".local_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "principalId" uuid NOT NULL UNIQUE,
  "passwordHash" text NOT NULL,
  "passwordUpdatedAt" timestamptz NOT NULL,
  "failedAttempts" integer NOT NULL DEFAULT 0,
  "lockedUntil" timestamptz,
  "mustChangePassword" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "identity".external_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "principalId" uuid NOT NULL,
  issuer varchar NOT NULL,
  subject varchar NOT NULL,
  provider varchar NOT NULL,
  "claimProfile" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "verificationState" varchar NOT NULL DEFAULT 'VERIFIED',
  "lastSyncedAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, subject)
);

CREATE TABLE IF NOT EXISTS "identity".sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "principalId" uuid NOT NULL,
  assurance varchar NOT NULL DEFAULT 'PASSWORD',
  "refreshTokenHash" text NOT NULL,
  "familyId" uuid NOT NULL,
  "deviceName" varchar,
  "ipAddress" varchar,
  "userAgent" text,
  "expiresAt" timestamptz NOT NULL,
  "absoluteExpiresAt" timestamptz NOT NULL,
  "revokedAt" timestamptz,
  "revokedReason" varchar,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "identity".verification_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "principalId" uuid NOT NULL,
  purpose varchar NOT NULL,
  destination varchar NOT NULL,
  "secretHash" text NOT NULL,
  "attemptCount" integer NOT NULL DEFAULT 0,
  "maxAttempts" integer NOT NULL DEFAULT 5,
  "resendAfter" timestamptz NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "consumedAt" timestamptz,
  status varchar NOT NULL DEFAULT 'PENDING',
  "correlationId" uuid NOT NULL,
  "requestIp" varchar,
  "requestUserAgent" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "identity".recovery_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "principalId" uuid NOT NULL,
  "tokenHash" text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "consumedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "identity".policy_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind varchar NOT NULL,
  version varchar NOT NULL,
  "publishedAt" timestamptz NOT NULL,
  "contentHash" varchar NOT NULL,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (kind, version)
);

CREATE TABLE IF NOT EXISTS "identity".policy_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "principalId" uuid NOT NULL,
  "policyDocumentId" uuid NOT NULL,
  "ipAddress" varchar,
  "userAgent" text,
  "acceptedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "identity".identity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "eventType" varchar NOT NULL,
  source varchar NOT NULL DEFAULT 'identity-adapter',
  "principalId" uuid,
  "actorId" uuid,
  "tenantId" uuid,
  "correlationId" uuid,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  "occurredAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "authorization".permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(150) NOT NULL UNIQUE,
  description text
);

CREATE TABLE IF NOT EXISTS "authorization".roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" uuid,
  code varchar(100) NOT NULL,
  name varchar(255) NOT NULL,
  "roleLevel" varchar NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "authorization".tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" uuid NOT NULL,
  "principalId" uuid NOT NULL,
  status varchar NOT NULL DEFAULT 'ACTIVE',
  source varchar NOT NULL DEFAULT 'INVITATION',
  "joinedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenantId", "principalId")
);

CREATE TABLE IF NOT EXISTS "authorization".invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tokenHash" varchar NOT NULL UNIQUE,
  "tenantId" uuid NOT NULL,
  "invitedEmail" varchar NOT NULL,
  "roleId" uuid NOT NULL,
  "invitedById" uuid NOT NULL,
  status varchar NOT NULL DEFAULT 'PENDING',
  "expiresAt" timestamptz NOT NULL,
  "acceptedAt" timestamptz,
  "acceptedById" uuid,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "authorization".role_permissions (
  role_id uuid NOT NULL REFERENCES "authorization".roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES "authorization".permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS "authorization".user_roles (
  membership_id uuid NOT NULL REFERENCES "authorization".tenant_memberships(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES "authorization".roles(id) ON DELETE CASCADE,
  PRIMARY KEY (membership_id, role_id)
);

CREATE TABLE IF NOT EXISTS "tenant".tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar NOT NULL,
  slug varchar NOT NULL UNIQUE,
  status varchar NOT NULL DEFAULT 'PROVISIONING',
  "homeRegion" varchar NOT NULL,
  "dataResidencyRegion" varchar NOT NULL,
  timezone varchar NOT NULL,
  "dataClass" varchar NOT NULL DEFAULT 'UNCLASSIFIED',
  "retentionPolicyRef" varchar NOT NULL DEFAULT 'default',
  "onboardingCompletedAt" timestamptz,
  "createdByPrincipalId" uuid NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "tenant".legal_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" uuid NOT NULL,
  "legalName" varchar NOT NULL,
  "registrationNumber" varchar,
  "countryOfRegistration" varchar,
  "registeredAddress" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "tenant".environments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" uuid NOT NULL,
  name varchar NOT NULL,
  "environmentType" varchar NOT NULL,
  region varchar NOT NULL,
  status varchar NOT NULL DEFAULT 'ACTIVE',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "tenant".customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" uuid NOT NULL,
  "partyId" uuid NOT NULL,
  "customerType" varchar NOT NULL,
  "lifecycleStatus" varchar NOT NULL DEFAULT 'ACTIVE',
  "kycStatus" varchar NOT NULL DEFAULT 'PENDING',
  segment varchar,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "tenant".organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" uuid NOT NULL,
  name varchar NOT NULL,
  status varchar NOT NULL DEFAULT 'ACTIVE',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_external_identities_principal ON "identity".external_identities ("principalId");
CREATE INDEX IF NOT EXISTS idx_sessions_principal ON "identity".sessions ("principalId");
CREATE INDEX IF NOT EXISTS idx_sessions_family ON "identity".sessions ("familyId");
CREATE INDEX IF NOT EXISTS idx_verification_challenges_principal ON "identity".verification_challenges ("principalId");
CREATE INDEX IF NOT EXISTS idx_identity_events_type ON "identity".identity_events ("eventType");
CREATE INDEX IF NOT EXISTS idx_identity_events_principal ON "identity".identity_events ("principalId");
CREATE INDEX IF NOT EXISTS idx_invitations_tenant ON "authorization".invitations ("tenantId");
CREATE INDEX IF NOT EXISTS idx_legal_entities_tenant ON "tenant".legal_entities ("tenantId");
CREATE INDEX IF NOT EXISTS idx_environments_tenant ON "tenant".environments ("tenantId");
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON "tenant".customers ("tenantId");
CREATE INDEX IF NOT EXISTS idx_organizations_tenant ON "tenant".organizations ("tenantId");

-- ---- 002_enterprise_federation.sql
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

-- ---- 003_authorization_boundaries.sql
INSERT INTO "authorization".permissions (id, code, description)
VALUES
  (
    gen_random_uuid(),
    'platform:tenant:onboard',
    'Provision a tenant from an approved commercial order'
  ),
  (
    gen_random_uuid(),
    'platform:meter-definition:manage',
    'Create and approve global meter definitions'
  ),
  (
    gen_random_uuid(),
    'platform:sla-definition:manage',
    'Create and approve global SLA definitions'
  ),
  (
    gen_random_uuid(),
    'platform:resource-definition:manage',
    'Create and approve global protected-resource definitions'
  ),
  (
    gen_random_uuid(),
    'tenant:resource:read',
    'Read tenant resources through a policy enforcement point'
  ),
  (
    gen_random_uuid(),
    'tenant:resource:write',
    'Create or modify tenant resources through a policy enforcement point'
  )
ON CONFLICT (code) DO NOTHING;

-- Existing PLATFORM_OWNER roles receive the newly introduced platform
-- capabilities. Deployments using differently named platform roles must grant
-- these permissions through the governed role-management workflow.
INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code IN (
    'platform:tenant:onboard',
    'platform:meter-definition:manage',
    'platform:sla-definition:manage',
    'platform:resource-definition:manage'
  )
WHERE role.code = 'PLATFORM_OWNER'
  AND role."roleLevel" = 'PLATFORM'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code IN (
    'tenant:resource:read',
    'tenant:resource:write'
  )
WHERE role.code = 'TENANT_OWNER'
  AND role."roleLevel" = 'TENANT'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ---- 004_commercial_account_boundaries.sql
INSERT INTO "authorization".permissions (id, code, description)
VALUES
  (
    gen_random_uuid(),
    'platform:commercial-account:manage',
    'Create commercial accounts and govern tenant/environment bindings'
  ),
  (
    gen_random_uuid(),
    'tenant:commercial-account:read',
    'Read the commercial accounts explicitly bound to the current tenant'
  )
ON CONFLICT (code) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code = 'platform:commercial-account:manage'
WHERE role.code = 'PLATFORM_OWNER'
  AND role."roleLevel" = 'PLATFORM'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code = 'tenant:commercial-account:read'
WHERE role.code = 'TENANT_OWNER'
  AND role."roleLevel" = 'TENANT'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ---- 005_commercial_customer_roles.sql
INSERT INTO "authorization".permissions (id, code, description)
VALUES
  (
    gen_random_uuid(),
    'tenant:commercial-account:manage',
    'Request and apply approved changes to a tenant-bound commercial account'
  ),
  (
    gen_random_uuid(),
    'tenant:commercial-account:approve',
    'Independently approve or reject tenant-bound commercial account changes'
  ),
  (
    gen_random_uuid(),
    'tenant:payment:create',
    'Pay an issued invoice using an approved account payment-method reference'
  ),
  (
    gen_random_uuid(),
    'tenant:refund:manage',
    'Issue a governed refund for a tenant-visible payment'
  )
ON CONFLICT (code) DO NOTHING;

INSERT INTO "authorization".roles (
  id, "tenantId", code, name, "roleLevel", "createdAt"
)
SELECT
  gen_random_uuid(), NULL, seed.code, seed.name, 'TENANT', now()
FROM (
  VALUES
    ('COMMERCIAL_ACCOUNT_OWNER', 'Commercial Account Owner'),
    ('BILLING_ADMIN', 'Billing Admin'),
    ('COMMERCIAL_APPROVER', 'Commercial Approver')
) AS seed(code, name)
WHERE NOT EXISTS (
  SELECT 1
  FROM "authorization".roles role
  WHERE role.code = seed.code
    AND role."roleLevel" = 'TENANT'
    AND role."tenantId" IS NULL
);

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code IN (
    'tenant:resource:read',
    'tenant:resource:write',
    'tenant:commercial-account:read',
    'tenant:commercial-account:manage',
    'tenant:commercial-account:approve',
    'tenant:payment:create'
  )
WHERE role.code = 'COMMERCIAL_ACCOUNT_OWNER'
  AND role."roleLevel" = 'TENANT'
  AND role."tenantId" IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code IN (
    'tenant:resource:read',
    'tenant:resource:write',
    'tenant:commercial-account:read',
    'tenant:commercial-account:manage',
    'tenant:payment:create'
  )
WHERE role.code = 'BILLING_ADMIN'
  AND role."roleLevel" = 'TENANT'
  AND role."tenantId" IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code IN (
    'tenant:resource:read',
    'tenant:resource:write',
    'tenant:commercial-account:read',
    'tenant:commercial-account:approve'
  )
WHERE role.code = 'COMMERCIAL_APPROVER'
  AND role."roleLevel" = 'TENANT'
  AND role."tenantId" IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ---- 006_group_delegation_corporate_transfer.sql
INSERT INTO "authorization".permissions (id, code, description)
VALUES
  (
    gen_random_uuid(),
    'tenant:partner-delegation:read',
    'Read explicit partner access grants visible to the current customer tenant'
  ),
  (
    gen_random_uuid(),
    'tenant:partner-delegation:manage',
    'Grant and revoke expiring operational partner access for the current customer tenant'
  ),
  (
    gen_random_uuid(),
    'tenant:partner-delegation:use',
    'Evaluate the authenticated partner principal against its explicit customer grant'
  ),
  (
    gen_random_uuid(),
    'tenant:corporate-transfer:manage',
    'Request and execute an approved subsidiary or business-unit transfer plan'
  ),
  (
    gen_random_uuid(),
    'tenant:corporate-transfer:approve',
    'Independently approve and reconcile a subsidiary or business-unit transfer plan'
  )
ON CONFLICT (code) DO NOTHING;

INSERT INTO "authorization".roles (
  id, "tenantId", code, name, "roleLevel", "createdAt"
)
SELECT
  gen_random_uuid(), NULL, 'PARTNER_DELEGATED_OPERATOR',
  'Partner Delegated Operator', 'TENANT', now()
WHERE NOT EXISTS (
  SELECT 1
  FROM "authorization".roles role
  WHERE role.code = 'PARTNER_DELEGATED_OPERATOR'
    AND role."roleLevel" = 'TENANT'
    AND role."tenantId" IS NULL
);

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code IN (
    'tenant:resource:read',
    'tenant:resource:write',
    'tenant:partner-delegation:use'
  )
WHERE role.code = 'PARTNER_DELEGATED_OPERATOR'
  AND role."roleLevel" = 'TENANT'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code IN (
    'tenant:partner-delegation:read',
    'tenant:partner-delegation:manage',
    'tenant:corporate-transfer:manage',
    'tenant:corporate-transfer:approve'
  )
WHERE role.code = 'TENANT_OWNER'
  AND role."roleLevel" = 'TENANT'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code IN (
    'tenant:corporate-transfer:manage',
    'tenant:corporate-transfer:approve'
  )
WHERE role.code = 'COMMERCIAL_ACCOUNT_OWNER'
  AND role."roleLevel" = 'TENANT'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code = 'tenant:corporate-transfer:manage'
WHERE role.code = 'BILLING_ADMIN'
  AND role."roleLevel" = 'TENANT'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code = 'tenant:corporate-transfer:approve'
WHERE role.code = 'COMMERCIAL_APPROVER'
  AND role."roleLevel" = 'TENANT'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ---- 007_category_a_partner_operation_write.sql
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

-- ---- 008_category_b_catalog_pricing_authority.sql
-- Category B1-B3: catalog and pre-production commercial programmes are
-- platform-plane operations. Finance/Commercial approval is deliberately a
-- separate permission so catalog makers cannot approve their own prices.
INSERT INTO "authorization".permissions (id, code, description)
VALUES
  (
    gen_random_uuid(),
    'platform:catalog:manage',
    'Manage catalog versions, stable products, bundle rules and governed evaluation programmes'
  ),
  (
    gen_random_uuid(),
    'platform:price:approve',
    'Independently approve prices and time-bound evaluation programme commercial terms'
  )
ON CONFLICT (code) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code IN ('platform:catalog:manage', 'platform:price:approve')
WHERE role.code IN ('PLATFORM_OWNER', 'PLATFORM_SUPER_ADMIN')
  AND role."roleLevel" = 'PLATFORM'
ON CONFLICT (role_id, permission_id) DO NOTHING;


-- ---- 009_category_b_change_readiness_concessions.sql
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

-- ---- 010_category_f_assurance_content_permissions.sql
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

-- ---- 011_category_g_ir_legal_sensitive_permissions.sql
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

-- ---- 012_category_g_professional_service_permissions.sql
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

-- ---- 013_category_h_ai_governance_permissions.sql
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

-- ---- 014_category_i_roadmap_permissions.sql
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

-- ---- 015_category_i_discount_margin_authority.sql
-- Category I3 discount-policy makers, policy approvers, and tenant approval
-- authority tiers. A shared permission admits the endpoint; the service and
-- PostgreSQL guard enforce the required role rank recorded on each review.

INSERT INTO "authorization".permissions (id, code, description) VALUES
  (gen_random_uuid(), 'platform:discount-policy:manage', 'Create versioned service-class discount and margin escalation policies'),
  (gen_random_uuid(), 'platform:discount-policy:approve', 'Independently approve or reject discount and margin escalation policies'),
  (gen_random_uuid(), 'tenant:discount:approve', 'Approve a tenant quote discount only at the authority tier required by its frozen margin review')
ON CONFLICT (code) DO NOTHING;

INSERT INTO "authorization".roles (
  id, "tenantId", code, name, "roleLevel", "createdAt"
)
SELECT gen_random_uuid(), NULL, seed.code, seed.name, 'TENANT', now()
FROM (
  VALUES
    ('FINANCE_COMMERCIAL_APPROVER', 'Finance Commercial Approver'),
    ('EXECUTIVE_COMMERCIAL_APPROVER', 'Executive Commercial Approver')
) AS seed(code, name)
WHERE NOT EXISTS (
  SELECT 1 FROM "authorization".roles role
  WHERE role.code = seed.code AND role."roleLevel" = 'TENANT' AND role."tenantId" IS NULL
);

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code = 'tenant:discount:approve'
WHERE role.code = 'COMMERCIAL_APPROVER'
  AND role."roleLevel" = 'TENANT' AND role."tenantId" IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code IN (
    'tenant:resource:read',
    'tenant:resource:write',
    'tenant:commercial-account:read',
    'tenant:commercial-account:approve',
    'tenant:discount:approve'
  )
WHERE role.code IN ('FINANCE_COMMERCIAL_APPROVER', 'EXECUTIVE_COMMERCIAL_APPROVER')
  AND role."roleLevel" = 'TENANT' AND role."tenantId" IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code IN (
    'platform:discount-policy:manage',
    'platform:discount-policy:approve'
  )
WHERE role.code IN ('PLATFORM_OWNER', 'PLATFORM_SUPER_ADMIN')
  AND role."roleLevel" = 'PLATFORM'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ---- 016_privacy_legal_permissions.sql
-- Cross-cutting privacy/legal permissions are intentionally separate from
-- ordinary tenant CRUD. Requesters cannot approve their own erasure request.
INSERT INTO "authorization".permissions (id, code, description)
VALUES
  (gen_random_uuid(), 'deletion:request', 'Submit a tenant-bound data deletion request'),
  (gen_random_uuid(), 'deletion:approve', 'Approve or reject a deletion request after identity, scope, retention and legal-hold review'),
  (gen_random_uuid(), 'legal_hold:create', 'Create a scoped legal hold that suspends conflicting deletion')
ON CONFLICT (code) DO NOTHING;

INSERT INTO "authorization".roles (id, "tenantId", code, name, "roleLevel", "createdAt")
SELECT gen_random_uuid(), NULL, 'PRIVACY_LEGAL_REVIEWER', 'Privacy and Legal Reviewer', 'TENANT', now()
WHERE NOT EXISTS (
  SELECT 1 FROM "authorization".roles role
  WHERE role.code = 'PRIVACY_LEGAL_REVIEWER'
    AND role."roleLevel" = 'TENANT'
    AND role."tenantId" IS NULL
);

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code IN (
    'tenant:resource:read',
    'tenant:resource:write',
    'deletion:approve',
    'legal_hold:create'
  )
WHERE role.code = 'PRIVACY_LEGAL_REVIEWER'
  AND role."roleLevel" = 'TENANT'
  AND role."tenantId" IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO "authorization".roles (id, "tenantId", code, name, "roleLevel", "createdAt")
SELECT gen_random_uuid(), NULL, 'PLATFORM_PRIVACY_LEGAL_REVIEWER', 'Platform Privacy and Legal Reviewer', 'PLATFORM', now()
WHERE NOT EXISTS (
  SELECT 1 FROM "authorization".roles role
  WHERE role.code = 'PLATFORM_PRIVACY_LEGAL_REVIEWER'
    AND role."roleLevel" = 'PLATFORM'
    AND role."tenantId" IS NULL
);

INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code IN (
    'deletion:request',
    'deletion:approve',
    'legal_hold:create'
  )
WHERE role.code = 'PLATFORM_PRIVACY_LEGAL_REVIEWER'
  AND role."roleLevel" = 'PLATFORM'
  AND role."tenantId" IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Tenant owners may submit deletion/offboarding requests, but legal hold and
-- approval authority must be explicitly assigned through the reviewer role.
DELETE FROM "authorization".role_permissions role_permission
USING "authorization".roles role, "authorization".permissions permission
WHERE role_permission.role_id = role.id
  AND role_permission.permission_id = permission.id
  AND role.code = 'TENANT_OWNER'
  AND role."roleLevel" = 'TENANT'
  AND permission.code IN ('deletion:approve', 'legal_hold:create');

-- ---- 017_privacy_requester_permissions.sql
-- Backfill deletion request authority for tenant-owner roles created before
-- the cross-cutting privacy workflow was introduced. Approval and legal-hold
-- authority remain isolated in the privacy/legal reviewer roles.
INSERT INTO "authorization".role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM "authorization".roles role
JOIN "authorization".permissions permission
  ON permission.code = 'deletion:request'
WHERE role.code = 'TENANT_OWNER'
  AND role."roleLevel" = 'TENANT'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ---- 018_owner_activation.sql
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

-- ---- 019_webauthn_passkeys.sql
-- WebAuthn/FIDO2 passkeys. Sessions authenticated this way carry PASSKEY
-- assurance, which is what @RequireAssurance-gated endpoints demand; before
-- this, password logins could only ever reach PASSWORD assurance.
CREATE TABLE IF NOT EXISTS identity.webauthn_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "principalId" uuid NOT NULL,
  "credentialId" text NOT NULL UNIQUE,
  "publicKeyPem" text NOT NULL,
  "signCount" bigint NOT NULL DEFAULT 0,
  label varchar,
  transports varchar,
  "lastUsedAt" timestamptz,
  "revokedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webauthn_credentials_principal
  ON identity.webauthn_credentials ("principalId");

-- Challenges are persisted, not in-process, so a replay cannot be retried
-- against another instance and consumption stays atomic across the fleet.
CREATE TABLE IF NOT EXISTS identity.webauthn_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "principalId" uuid,
  purpose varchar NOT NULL,
  challenge text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "consumedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webauthn_challenges_lookup
  ON identity.webauthn_challenges (challenge);

CREATE INDEX IF NOT EXISTS webauthn_challenges_principal
  ON identity.webauthn_challenges ("principalId");

-- ---- 020_membership_elevation_and_jit_requests.sql
-- Catches the migrations up with the entities.
--
-- Two things the application code depends on were never written as SQL, and
-- existed in development only because scripts/seed-platform-admin.ts used to
-- run TypeORM with `synchronize: true`, which silently reshaped whatever
-- database it was pointed at. A freshly migrated database had neither, so
-- JIT elevation and time-boxed memberships would fail at runtime on any new
-- environment.
--
-- The seeder no longer synchronizes, and `npm run check:schema-drift` now
-- builds a scratch database from these files and fails if the entities need
-- anything the migrations do not provide.

-- 1. Time-boxed / elevated memberships (TenantMembership.expiresAt,
--    elevationPurpose, elevationApprovedBy).
ALTER TABLE "authorization".tenant_memberships
  ADD COLUMN IF NOT EXISTS "expiresAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "elevationPurpose" varchar,
  ADD COLUMN IF NOT EXISTS "elevationApprovedBy" uuid;

-- Repair for databases the synchronizing seeder already reached: it rewrote
-- joinedAt from timestamptz to a naive timestamp, which drops the offset.
-- Existing values are interpreted as UTC, which is what they were written as.
ALTER TABLE "authorization".tenant_memberships
  ALTER COLUMN "joinedAt" TYPE timestamptz USING "joinedAt" AT TIME ZONE 'UTC';

-- 2. JIT elevation requests — the break-glass approval record for a platform
--    super admin taking temporary access into a customer tenant. Referenced
--    by JitElevationRequest and the /admin/jit surface; no migration ever
--    created it.
CREATE TABLE IF NOT EXISTS "authorization".jit_elevation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "superAdminPrincipalId" uuid NOT NULL,
  "targetTenantId" uuid NOT NULL,
  "statedPurpose" text NOT NULL,
  "requestedDurationMinutes" integer NOT NULL DEFAULT 60,
  "roleCode" varchar NOT NULL DEFAULT 'TENANT_SECURITY_ANALYST',
  status varchar NOT NULL DEFAULT 'PENDING',
  "approvedByPrincipalId" uuid,
  "rejectionReason" text,
  "approvedAt" timestamptz,
  "expiresAt" timestamptz,
  "membershipId" uuid,
  "customerVisibleAuditLogRef" varchar(64) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jit_elevation_requests_tenant_status_idx
  ON "authorization".jit_elevation_requests ("targetTenantId", status);
CREATE INDEX IF NOT EXISTS jit_elevation_requests_admin_tenant_idx
  ON "authorization".jit_elevation_requests ("superAdminPrincipalId", "targetTenantId");
