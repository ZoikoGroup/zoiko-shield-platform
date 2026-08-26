-- Category D extension: meter billing export audit fields and invoice basis
-- policy traceability. All new columns are nullable or have safe defaults so
-- they apply without data migration.

-- MeterBillingExport: capture the billing basis classification, excluded
-- event set, and committed-capacity accounting flag that meter-governance
-- service now derives and persists when creating or reconciling exports.
ALTER TABLE "MeterBillingExport"
  ADD COLUMN "billing_basis"               TEXT    NOT NULL DEFAULT 'ACCEPTED_DATA_USAGE',
  ADD COLUMN "excluded_event_ids"          TEXT    NOT NULL DEFAULT '[]',
  ADD COLUMN "committed_capacity_included" BOOLEAN NOT NULL DEFAULT false;

-- CommercialInvoiceLineBasis: link the basis row back to the
-- MeterAuthorizationPolicy that governed the export it references, enabling
-- reconciliation checks to verify the policy was active and unmodified at
-- invoice issuance time.
ALTER TABLE "CommercialInvoiceLineBasis"
  ADD COLUMN "meter_authorization_policy_id" TEXT;

CREATE INDEX "CommercialInvoiceLineBasis_meter_authorization_policy_id_idx"
  ON "CommercialInvoiceLineBasis"("meter_authorization_policy_id");

ALTER TABLE "CommercialInvoiceLineBasis"
  ADD CONSTRAINT "CommercialInvoiceLineBasis_meter_authorization_policy_id_fkey"
    FOREIGN KEY ("meter_authorization_policy_id")
    REFERENCES "MeterAuthorizationPolicy"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
