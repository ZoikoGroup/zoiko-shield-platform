-- Category A3: a provider-issued payment-method reference may be selected as
-- the account default only through the governed commercial change workflow.
ALTER TABLE "CommercialAccount"
  ADD COLUMN "default_payment_method_reference_id" TEXT;

ALTER TABLE "PaymentMethodReference"
  ADD COLUMN "updated_at" TIMESTAMP(3);

UPDATE "PaymentMethodReference"
SET "updated_at" = "created_at"
WHERE "updated_at" IS NULL;

ALTER TABLE "PaymentMethodReference"
  ALTER COLUMN "updated_at" SET NOT NULL;

CREATE UNIQUE INDEX "CommercialAccount_default_payment_method_reference_id_key"
  ON "CommercialAccount"("default_payment_method_reference_id");
CREATE UNIQUE INDEX "PaymentMethodReference_provider_provider_token_key"
  ON "PaymentMethodReference"("provider", "provider_token");
DROP INDEX "PaymentMethodReference_commercial_account_id_idx";
CREATE INDEX "PaymentMethodReference_commercial_account_id_status_idx"
  ON "PaymentMethodReference"("commercial_account_id", "status");

ALTER TABLE "PaymentMethodReference"
  ADD CONSTRAINT "PaymentMethodReference_commercial_account_id_fkey"
  FOREIGN KEY ("commercial_account_id") REFERENCES "CommercialAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommercialAccount"
  ADD CONSTRAINT "CommercialAccount_default_payment_method_reference_id_fkey"
  FOREIGN KEY ("default_payment_method_reference_id") REFERENCES "PaymentMethodReference"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Commercial approvals become tenant-addressable so approval reads and
-- decisions can be scoped without trusting object names or request payloads.
ALTER TABLE "CommercialApproval"
  ADD COLUMN "tenant_id" TEXT;
CREATE INDEX "CommercialApproval_tenant_id_status_idx"
  ON "CommercialApproval"("tenant_id", "status");
