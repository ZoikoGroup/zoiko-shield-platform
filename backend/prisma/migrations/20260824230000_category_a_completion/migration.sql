-- Category A4 completion: make the partner identity/managing-organization
-- relationship authoritative instead of trusting identifiers supplied in a
-- customer grant.
CREATE TABLE "PartnerPrincipalContext" (
  "id" TEXT NOT NULL,
  "partner_id" TEXT NOT NULL,
  "principal_id" TEXT NOT NULL,
  "managing_organization_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_by" TEXT NOT NULL,
  "deactivated_by" TEXT,
  "deactivated_at" TIMESTAMP(3),
  "deactivation_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerPrincipalContext_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartnerPrincipalContext_principal_id_key"
  ON "PartnerPrincipalContext"("principal_id");
CREATE INDEX "PartnerPrincipalContext_partner_id_status_idx"
  ON "PartnerPrincipalContext"("partner_id", "status");
CREATE INDEX "PartnerPrincipalContext_managing_organization_id_status_idx"
  ON "PartnerPrincipalContext"("managing_organization_id", "status");
ALTER TABLE "PartnerPrincipalContext"
  ADD CONSTRAINT "PartnerPrincipalContext_partner_id_fkey"
  FOREIGN KEY ("partner_id") REFERENCES "Partner"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PartnerDelegation"
  ADD COLUMN "partner_principal_context_id" TEXT;
CREATE INDEX "PartnerDelegation_partner_principal_context_id_status_idx"
  ON "PartnerDelegation"("partner_principal_context_id", "status");
ALTER TABLE "PartnerDelegation"
  ADD CONSTRAINT "PartnerDelegation_partner_principal_context_id_fkey"
  FOREIGN KEY ("partner_principal_context_id")
  REFERENCES "PartnerPrincipalContext"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing rows remain non-authoritative and unusable until reviewed. The
-- preceding A migration already marks them MIGRATION_REVIEW; no identity is
-- silently trusted or backfilled from its legacy free-form principal value.

-- Support access is a separately scoped customer workflow. It does not reuse
-- operational security cases and carries no pricing/payment authority.
CREATE TABLE "PartnerSupportCase" (
  "id" TEXT NOT NULL,
  "commercial_account_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "created_by" TEXT NOT NULL,
  "updated_by" TEXT,
  "created_via_delegation_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerSupportCase_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PartnerSupportCase_commercial_account_id_tenant_id_environm_idx"
  ON "PartnerSupportCase"("commercial_account_id", "tenant_id", "environment_id");
CREATE INDEX "PartnerSupportCase_tenant_id_status_idx"
  ON "PartnerSupportCase"("tenant_id", "status");
CREATE INDEX "PartnerSupportCase_created_via_delegation_id_idx"
  ON "PartnerSupportCase"("created_via_delegation_id");
ALTER TABLE "PartnerSupportCase"
  ADD CONSTRAINT "PartnerSupportCase_commercial_account_id_fkey"
  FOREIGN KEY ("commercial_account_id") REFERENCES "CommercialAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerSupportCase"
  ADD CONSTRAINT "PartnerSupportCase_created_via_delegation_id_fkey"
  FOREIGN KEY ("created_via_delegation_id") REFERENCES "PartnerDelegation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
