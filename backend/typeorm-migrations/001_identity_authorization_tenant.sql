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
