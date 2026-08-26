-- Category J1: an invoice represents the approved commercial entitlement or
-- service obligation for its period. It is deliberately not proof that every
-- security outcome succeeded; service-performance remedies remain append-only.

ALTER TABLE "CommercialInvoiceLine"
  ADD COLUMN "order_line_id" TEXT,
  ADD COLUMN "price_book_id" TEXT,
  ADD COLUMN "representation_scope" TEXT NOT NULL DEFAULT 'COMMERCIAL_ENTITLEMENT_OR_OBLIGATION',
  ADD CONSTRAINT "CommercialInvoiceLine_commercial_values_check" CHECK (
    "representation_scope" = 'COMMERCIAL_ENTITLEMENT_OR_OBLIGATION' AND
    "quantity" > 0 AND "unit_price" >= 0 AND
    "discount_percent" >= 0 AND "discount_percent" <= 100 AND
    "tax_amount" >= 0 AND "service_period_end" > "service_period_start"
  );

CREATE INDEX "CommercialInvoiceLine_order_line_id_idx"
  ON "CommercialInvoiceLine"("order_line_id");
CREATE INDEX "CommercialInvoiceLine_price_book_id_idx"
  ON "CommercialInvoiceLine"("price_book_id");
ALTER TABLE "CommercialInvoiceLine"
  ADD CONSTRAINT "CommercialInvoiceLine_order_line_id_fkey"
    FOREIGN KEY ("order_line_id") REFERENCES "CommercialOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CommercialInvoiceLine_price_book_id_fkey"
    FOREIGN KEY ("price_book_id") REFERENCES "PriceBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CommercialInvoiceLineBasis" (
  "id" TEXT NOT NULL,
  "invoice_line_id" TEXT NOT NULL,
  "basis_type" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "entitlement_id" TEXT,
  "service_obligation_id" TEXT,
  "meter_billing_export_id" TEXT,
  "source_status" TEXT NOT NULL,
  "source_version" TEXT NOT NULL DEFAULT 'v1',
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unit" TEXT NOT NULL,
  "service_period_start" TIMESTAMP(3) NOT NULL,
  "service_period_end" TIMESTAMP(3) NOT NULL,
  "source_snapshot" TEXT NOT NULL,
  "source_snapshot_hash" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommercialInvoiceLineBasis_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommercialInvoiceLineBasis_shape_check" CHECK (
    "basis_type" IN ('ENTITLEMENT', 'SERVICE_OBLIGATION', 'METER_SNAPSHOT') AND
    NULLIF(BTRIM("source_id"), '') IS NOT NULL AND
    NULLIF(BTRIM("source_status"), '') IS NOT NULL AND
    NULLIF(BTRIM("unit"), '') IS NOT NULL AND
    "quantity" > 0 AND "service_period_end" > "service_period_start" AND
    "source_snapshot_hash" ~ '^[0-9a-f]{64}$' AND
    (
      ("basis_type" = 'ENTITLEMENT' AND
        "entitlement_id" = "source_id" AND
        "service_obligation_id" IS NULL AND "meter_billing_export_id" IS NULL) OR
      ("basis_type" = 'SERVICE_OBLIGATION' AND
        "service_obligation_id" = "source_id" AND
        "entitlement_id" IS NULL AND "meter_billing_export_id" IS NULL) OR
      ("basis_type" = 'METER_SNAPSHOT' AND
        "meter_billing_export_id" = "source_id" AND
        "entitlement_id" IS NULL AND "service_obligation_id" IS NULL)
    )
  )
);

CREATE UNIQUE INDEX "CommercialInvoiceLineBasis_invoice_line_id_basis_type_sourc_key"
  ON "CommercialInvoiceLineBasis"("invoice_line_id", "basis_type", "source_id");
CREATE INDEX "CommercialInvoiceLineBasis_entitlement_id_idx"
  ON "CommercialInvoiceLineBasis"("entitlement_id");
CREATE INDEX "CommercialInvoiceLineBasis_service_obligation_id_idx"
  ON "CommercialInvoiceLineBasis"("service_obligation_id");
CREATE INDEX "CommercialInvoiceLineBasis_meter_billing_export_id_idx"
  ON "CommercialInvoiceLineBasis"("meter_billing_export_id");
ALTER TABLE "CommercialInvoiceLineBasis"
  ADD CONSTRAINT "CommercialInvoiceLineBasis_invoice_line_id_fkey"
    FOREIGN KEY ("invoice_line_id") REFERENCES "CommercialInvoiceLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CommercialInvoiceLineBasis_entitlement_id_fkey"
    FOREIGN KEY ("entitlement_id") REFERENCES "Entitlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CommercialInvoiceLineBasis_service_obligation_id_fkey"
    FOREIGN KEY ("service_obligation_id") REFERENCES "ServiceObligation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CommercialInvoiceLineBasis_meter_billing_export_id_fkey"
    FOREIGN KEY ("meter_billing_export_id") REFERENCES "MeterBillingExport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "enforce_invoice_line_commercial_basis"() RETURNS trigger AS $$
DECLARE
  source_record RECORD;
BEGIN
  SELECT
    invoice."status" AS invoice_status,
    invoice."commercial_account_id" AS invoice_account_id,
    invoice."contract_id" AS invoice_contract_id,
    invoice."currency" AS invoice_currency,
    contract."status" AS contract_status,
    contract."term_start" AS contract_start,
    contract."term_end" AS contract_end,
    orders."status" AS order_status,
    orders."contract_id" AS order_contract_id,
    orders."commercial_account_id" AS order_account_id,
    orders."tenant_id" AS order_tenant_id,
    order_line."line_type" AS order_line_type,
    order_line."billable" AS order_line_billable,
    order_line."currency" AS order_line_currency,
    order_line."list_unit_price" AS order_list_unit_price,
    order_line."discount_percent" AS order_discount_percent,
    COALESCE(NULLIF(order_line."catalog_sku", ''), product."sku") AS order_sku,
    quote."status" AS quote_status,
    quote_line."price_book_id" AS quote_price_book_id,
    quote_line."unit_price" AS quote_unit_price,
    quote_line."line_discount_percent" AS quote_discount_percent,
    price_book."status" AS price_book_status,
    price_book."product_id" AS price_book_product_id,
    price_book."catalog_version_id" AS price_book_catalog_version_id,
    price_book."commercial_account_id" AS price_book_account_id,
    price_book."currency" AS price_book_currency,
    price_book."unit_price" AS price_book_unit_price,
    order_line."product_id" AS order_product_id,
    quote."catalog_version_id" AS quote_catalog_version_id
  INTO source_record
  FROM "CommercialInvoice" invoice
  JOIN "Contract" contract ON contract."id" = invoice."contract_id"
  JOIN "CommercialOrderLine" order_line ON order_line."id" = NEW."order_line_id"
  JOIN "Product" product ON product."id" = order_line."product_id"
  JOIN "CommercialOrder" orders ON orders."id" = order_line."order_id"
  JOIN "CommercialQuote" quote ON quote."id" = orders."quote_id"
  JOIN "CommercialQuoteLine" quote_line
    ON quote_line."quote_id" = quote."id" AND quote_line."product_id" = order_line."product_id"
      AND quote_line."price_book_id" = NEW."price_book_id"
  JOIN "PriceBook" price_book ON price_book."id" = NEW."price_book_id"
  WHERE invoice."id" = NEW."invoice_id";

  IF source_record IS NULL OR source_record.invoice_status <> 'DRAFT' OR
     NEW."contract_id" <> source_record.invoice_contract_id OR
     source_record.invoice_account_id <> source_record.order_account_id OR
     source_record.invoice_account_id <> (SELECT "commercial_account_id" FROM "Contract" WHERE "id" = NEW."contract_id") OR
     source_record.invoice_currency <> NEW."currency" OR
     source_record.contract_status <> 'ACTIVE' OR
     NEW."service_period_start" < source_record.contract_start OR
     NEW."service_period_end" > source_record.contract_end OR
     source_record.order_status <> 'PROVISIONED' OR
     source_record.order_contract_id <> NEW."contract_id" OR
     source_record.order_line_type <> 'CUSTOMER' OR NOT source_record.order_line_billable OR
     source_record.order_line_currency <> NEW."currency" OR
     source_record.order_sku <> NEW."sku" OR
     source_record.quote_status <> 'APPROVED' OR
     source_record.quote_price_book_id <> NEW."price_book_id" OR
     source_record.quote_unit_price <> source_record.order_list_unit_price OR
     source_record.quote_discount_percent <> source_record.order_discount_percent OR
     source_record.price_book_status <> 'APPROVED' OR
     source_record.price_book_product_id <> source_record.order_product_id OR
     source_record.price_book_catalog_version_id <> source_record.quote_catalog_version_id OR
     source_record.price_book_currency <> NEW."currency" OR
     (source_record.price_book_account_id IS NOT NULL AND
       source_record.price_book_account_id <> source_record.invoice_account_id) OR
     source_record.price_book_unit_price <> source_record.order_list_unit_price OR
     NEW."unit_price" <> source_record.order_list_unit_price OR
     NEW."discount_percent" <> source_record.order_discount_percent THEN
    RAISE EXCEPTION 'invoice line does not reconcile to its active contract, provisioned customer order, approved quote or frozen price book';
  END IF;

  IF NEW."subscription_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "CommercialSubscription" subscription
    WHERE subscription."id" = NEW."subscription_id"
      AND subscription."order_id" = (SELECT "order_id" FROM "CommercialOrderLine" WHERE "id" = NEW."order_line_id")
      AND subscription."commercial_account_id" = source_record.invoice_account_id
      AND subscription."contract_id" = NEW."contract_id"
      AND subscription."status" = 'ACTIVE'
      AND subscription."effective_from" <= NEW."service_period_start"
      AND (subscription."effective_to" IS NULL OR subscription."effective_to" >= NEW."service_period_end")
  ) THEN
    RAISE EXCEPTION 'invoice subscription basis is not active for the order, contract and service period';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CommercialInvoiceLine_commercial_basis_guard"
  BEFORE INSERT OR UPDATE ON "CommercialInvoiceLine"
  FOR EACH ROW EXECUTE FUNCTION "enforce_invoice_line_commercial_basis"();

CREATE FUNCTION "enforce_invoice_basis_source"() RETURNS trigger AS $$
DECLARE
  line_record RECORD;
BEGIN
  SELECT line.*, invoice."status" AS invoice_status,
         invoice."commercial_account_id" AS invoice_account_id,
         invoice."contract_id" AS invoice_contract_id,
         orders."tenant_id" AS order_tenant_id
    INTO line_record
    FROM "CommercialInvoiceLine" line
    JOIN "CommercialInvoice" invoice ON invoice."id" = line."invoice_id"
    JOIN "CommercialOrderLine" order_line ON order_line."id" = line."order_line_id"
    JOIN "CommercialOrder" orders ON orders."id" = order_line."order_id"
    WHERE line."id" = NEW."invoice_line_id";

  IF line_record IS NULL OR line_record.invoice_status <> 'DRAFT' OR
     NEW."service_period_start" <> line_record."service_period_start" OR
     NEW."service_period_end" <> line_record."service_period_end" THEN
    RAISE EXCEPTION 'invoice basis must belong to a DRAFT line and exactly match its service period';
  END IF;

  IF NEW."basis_type" = 'ENTITLEMENT' THEN
    IF NEW."source_status" <> 'ACTIVE' OR NEW."unit" <> 'ENTITLEMENT' OR
       NEW."quantity" <> line_record."quantity" OR NOT EXISTS (
      SELECT 1 FROM "Entitlement" entitlement
      WHERE entitlement."id" = NEW."entitlement_id"
        AND entitlement."commercial_account_id" = line_record.invoice_account_id
        AND entitlement."status" = 'ACTIVE'
        AND entitlement."effective_from" <= NEW."service_period_start"
        AND (entitlement."effective_to" IS NULL OR entitlement."effective_to" >= NEW."service_period_end")
    ) THEN
      RAISE EXCEPTION 'invoice entitlement basis is not active for its account and period';
    END IF;
  ELSIF NEW."basis_type" = 'SERVICE_OBLIGATION' THEN
    IF NEW."quantity" <> 1 OR NEW."unit" <> 'OBLIGATION' OR NOT EXISTS (
      SELECT 1 FROM "ServiceObligation" obligation
      WHERE obligation."id" = NEW."service_obligation_id"
        AND obligation."contract_id" = line_record.invoice_contract_id
        AND obligation."status" = NEW."source_status"
        AND obligation."status" NOT IN ('CANCELLED', 'WAIVED')
    ) THEN
      RAISE EXCEPTION 'invoice service-obligation basis is cancelled, waived or belongs to another contract';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM "MeterBillingExport" meter
      WHERE meter."id" = NEW."meter_billing_export_id"
        AND meter."contract_id" = line_record.invoice_contract_id
        AND meter."tenant_id" = line_record.order_tenant_id
        AND meter."period_start" = NEW."service_period_start"
        AND meter."period_end" = NEW."service_period_end"
        AND meter."status" = 'APPROVED' AND NEW."source_status" = 'APPROVED'
        AND meter."billable_quantity" = NEW."quantity"
        AND meter."immutable_snapshot" = NEW."source_snapshot"
        AND meter."checksum" = NEW."source_snapshot_hash"
    ) THEN
      RAISE EXCEPTION 'invoice meter basis is not an approved matching immutable billing export';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CommercialInvoiceLineBasis_source_guard"
  BEFORE INSERT OR UPDATE ON "CommercialInvoiceLineBasis"
  FOR EACH ROW EXECUTE FUNCTION "enforce_invoice_basis_source"();

CREATE FUNCTION "enforce_invoice_commercial_basis_before_issue"() RETURNS trigger AS $$
DECLARE
  frozen JSONB;
  expected_total NUMERIC;
BEGIN
  IF NEW."status" = 'ISSUED' AND OLD."status" <> 'ISSUED' THEN
    IF NOT EXISTS (SELECT 1 FROM "CommercialInvoiceLine" WHERE "invoice_id" = NEW."id") OR EXISTS (
      SELECT 1 FROM "CommercialInvoiceLine" line
      WHERE line."invoice_id" = NEW."id" AND (
        line."order_line_id" IS NULL OR line."price_book_id" IS NULL OR
        line."representation_scope" <> 'COMMERCIAL_ENTITLEMENT_OR_OBLIGATION' OR
        NOT EXISTS (SELECT 1 FROM "CommercialInvoiceLineBasis" basis WHERE basis."invoice_line_id" = line."id")
      )
    ) THEN
      RAISE EXCEPTION 'invoice issuance requires normalized order, approved-price and entitlement/service/meter bases on every line';
    END IF;

    IF EXISTS (
      SELECT 1 FROM "CommercialInvoiceLine" line
      JOIN "CommercialInvoiceLineBasis" basis ON basis."invoice_line_id" = line."id"
      LEFT JOIN "Entitlement" entitlement ON entitlement."id" = basis."entitlement_id"
      LEFT JOIN "ServiceObligation" obligation ON obligation."id" = basis."service_obligation_id"
      LEFT JOIN "MeterBillingExport" meter ON meter."id" = basis."meter_billing_export_id"
      WHERE line."invoice_id" = NEW."id" AND (
        basis."source_snapshot_hash" !~ '^[0-9a-f]{64}$' OR
        (basis."basis_type" = 'ENTITLEMENT' AND
          (entitlement."status" <> 'ACTIVE' OR entitlement."commercial_account_id" <> NEW."commercial_account_id")) OR
        (basis."basis_type" = 'SERVICE_OBLIGATION' AND
          (obligation."status" IN ('CANCELLED', 'WAIVED') OR obligation."contract_id" <> NEW."contract_id")) OR
        (basis."basis_type" = 'METER_SNAPSHOT' AND
          (meter."status" <> 'APPROVED' OR meter."checksum" <> basis."source_snapshot_hash" OR
           meter."immutable_snapshot" <> basis."source_snapshot" OR meter."billable_quantity" <> basis."quantity"))
      )
    ) THEN
      RAISE EXCEPTION 'invoice basis source is no longer valid at issuance';
    END IF;

    IF EXISTS (
      SELECT 1 FROM "CommercialInvoiceLine" line
      JOIN "CommercialInvoiceLineBasis" basis ON basis."invoice_line_id" = line."id"
      WHERE line."invoice_id" = NEW."id" AND basis."basis_type" = 'METER_SNAPSHOT'
      GROUP BY line."id", line."quantity"
      HAVING SUM(basis."quantity") <> line."quantity"
    ) THEN
      RAISE EXCEPTION 'invoice line quantity does not reconcile to approved meter snapshots';
    END IF;

    SELECT COALESCE(SUM(
      line."quantity" * line."unit_price" * (1 - line."discount_percent" / 100) + line."tax_amount"
    ), 0) INTO expected_total
    FROM "CommercialInvoiceLine" line WHERE line."invoice_id" = NEW."id";
    IF ABS(NEW."total_amount" - expected_total) > 0.0001 THEN
      RAISE EXCEPTION 'issued invoice total does not reconcile to its frozen lines and tax';
    END IF;

    frozen := NEW."immutable_snapshot"::jsonb;
    IF frozen ->> 'representationScope' <> 'COMMERCIAL_ENTITLEMENT_OR_OBLIGATION' OR
       frozen ->> 'securityOutcomeProof' <> 'false' OR
       frozen ->> 'serviceExceptionRemedy' <> 'APPEND_ONLY_CREDIT_NOTE' THEN
      RAISE EXCEPTION 'issued invoice snapshot must distinguish commercial basis from security-outcome proof and retain append-only remedies';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CommercialInvoice_commercial_basis_issue_guard"
  BEFORE UPDATE OF "status" ON "CommercialInvoice"
  FOR EACH ROW EXECUTE FUNCTION "enforce_invoice_commercial_basis_before_issue"();

CREATE FUNCTION "reject_issued_invoice_basis_mutation"() RETURNS trigger AS $$
DECLARE
  target_line_id TEXT;
BEGIN
  target_line_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."invoice_line_id" ELSE NEW."invoice_line_id" END;
  IF EXISTS (
    SELECT 1 FROM "CommercialInvoiceLine" line
    JOIN "CommercialInvoice" invoice ON invoice."id" = line."invoice_id"
    WHERE line."id" = target_line_id AND invoice."status" = 'ISSUED'
  ) THEN
    RAISE EXCEPTION 'issued invoice commercial basis is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CommercialInvoiceLineBasis_issued_immutable"
  BEFORE INSERT OR UPDATE OR DELETE ON "CommercialInvoiceLineBasis"
  FOR EACH ROW EXECUTE FUNCTION "reject_issued_invoice_basis_mutation"();
