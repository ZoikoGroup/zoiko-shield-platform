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
