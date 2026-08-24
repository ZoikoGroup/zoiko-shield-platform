-- ZS-COM-BILL-001 A / minimum commercial-account master data.
ALTER TABLE "CommercialAccount"
  ADD COLUMN "customer_legal_name" TEXT,
  ADD COLUMN "billing_address" TEXT NOT NULL DEFAULT '{}',
  ADD COLUMN "tax_facts" TEXT NOT NULL DEFAULT '{}',
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "contacts" TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN "billing_source_reference" TEXT,
  ADD COLUMN "contract_owner_id" TEXT,
  ADD COLUMN "processor_customer_ref" TEXT;

-- Existing display names are the safest non-invented legal-name seed. They
-- must be verified through the governed commercial workflow before quoting.
UPDATE "CommercialAccount"
SET "customer_legal_name" = "name"
WHERE "customer_legal_name" IS NULL;

ALTER TABLE "CommercialAccount"
  ALTER COLUMN "customer_legal_name" SET NOT NULL;

-- A payer can cover multiple tenant/environment/legal-entity combinations.
-- This relation is authoritative for scope; legacy account columns remain only
-- for compatibility with historical records.
CREATE TABLE "CommercialAccountTenantBinding" (
  "id" TEXT NOT NULL,
  "commercial_account_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "legal_entity_id" TEXT,
  "business_unit_id" TEXT,
  "environment_id" TEXT NOT NULL,
  "region" TEXT NOT NULL DEFAULT 'GLOBAL',
  "residency_policy" TEXT,
  "service_scope" TEXT NOT NULL DEFAULT '[]',
  "relationship_type" TEXT NOT NULL DEFAULT 'CUSTOMER',
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effective_to" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CommercialAccountTenantBinding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommercialAccountTenantBinding_commercial_account_id_tenant_id_environment_id_key"
  ON "CommercialAccountTenantBinding"("commercial_account_id", "tenant_id", "environment_id");
CREATE INDEX "CommercialAccountTenantBinding_tenant_id_status_idx"
  ON "CommercialAccountTenantBinding"("tenant_id", "status");
CREATE INDEX "CommercialAccountTenantBinding_legal_entity_id_idx"
  ON "CommercialAccountTenantBinding"("legal_entity_id");
CREATE INDEX "CommercialAccountTenantBinding_environment_id_region_idx"
  ON "CommercialAccountTenantBinding"("environment_id", "region");

ALTER TABLE "CommercialAccountTenantBinding"
  ADD CONSTRAINT "CommercialAccountTenantBinding_commercial_account_id_fkey"
  FOREIGN KEY ("commercial_account_id") REFERENCES "CommercialAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve existing account/tenant links inferred from explicit entitlements
-- or orders. Tenant names are never used to infer payer or authority.
WITH historical_links AS (
  SELECT DISTINCT
    entitlement."commercial_account_id",
    entitlement."tenant_id"
  FROM "Entitlement" entitlement
  UNION
  SELECT DISTINCT
    commercial_order."commercial_account_id",
    commercial_order."tenant_id"
  FROM "CommercialOrder" commercial_order
  WHERE commercial_order."tenant_id" IS NOT NULL
)
INSERT INTO "CommercialAccountTenantBinding" (
  "id",
  "commercial_account_id",
  "tenant_id",
  "legal_entity_id",
  "business_unit_id",
  "environment_id",
  "region",
  "residency_policy",
  "is_primary",
  "status",
  "updated_at"
)
SELECT
  gen_random_uuid()::text,
  link."commercial_account_id",
  link."tenant_id",
  account."legal_entity_id",
  account."business_unit_id",
  COALESCE(account."environment_id", 'default-env'),
  account."region",
  account."residency_policy",
  true,
  account."status",
  CURRENT_TIMESTAMP
FROM historical_links link
JOIN "CommercialAccount" account ON account."id" = link."commercial_account_id"
ON CONFLICT ("commercial_account_id", "tenant_id", "environment_id") DO NOTHING;
