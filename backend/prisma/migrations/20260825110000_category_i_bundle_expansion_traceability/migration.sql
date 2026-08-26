-- Category I4: a customer-facing bundle remains one commercial line while its
-- technology, human-service, entitlement, meter, obligation, cost and claim
-- records remain explicit and invoice-reconcilable underneath.

ALTER TABLE "CommercialOrderLine"
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "line_type" TEXT NOT NULL DEFAULT 'CUSTOMER',
  ADD COLUMN "billable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "catalog_sku" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "bundle_parent_product_id" TEXT,
  ADD COLUMN "component_type" TEXT,
  ADD COLUMN "entitlement_offer_type" TEXT,
  ADD COLUMN "meter_definition_id" TEXT,
  ADD COLUMN "service_obligation_type" TEXT,
  ADD COLUMN "cost_class" TEXT,
  ADD COLUMN "cost_allocation_percent" DECIMAL(5,2),
  ADD COLUMN "claim_key" TEXT,
  ADD COLUMN "claim_register_id" TEXT,
  ADD COLUMN "invoice_presentation" TEXT NOT NULL DEFAULT 'SEPARATE',
  ADD COLUMN "component_snapshot" TEXT NOT NULL DEFAULT '{}',
  ADD COLUMN "component_snapshot_hash" TEXT,
  ADD COLUMN "projection_status" TEXT NOT NULL DEFAULT 'NOT_APPLICABLE';

ALTER TABLE "CommercialOrderLine"
  ADD CONSTRAINT "CommercialOrderLine_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CommercialOrderLine_bundle_parent_product_id_fkey"
    FOREIGN KEY ("bundle_parent_product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CommercialOrderLine_bundle_shape_check" CHECK (
    (
      "line_type" = 'CUSTOMER' AND "billable" = true AND
      "bundle_parent_product_id" IS NULL AND "component_type" IS NULL AND
      "cost_allocation_percent" IS NULL AND "projection_status" = 'NOT_APPLICABLE'
    ) OR (
      "line_type" = 'BUNDLE_COMPONENT' AND "billable" = false AND
      "bundle_parent_product_id" IS NOT NULL AND
      "component_type" IN ('TECHNOLOGY', 'HUMAN_SERVICE') AND
      NULLIF(BTRIM("catalog_sku"), '') IS NOT NULL AND
      NULLIF(BTRIM("cost_class"), '') IS NOT NULL AND
      "cost_allocation_percent" > 0 AND "cost_allocation_percent" <= 100 AND
      NULLIF(BTRIM("claim_key"), '') IS NOT NULL AND
      NULLIF(BTRIM("claim_register_id"), '') IS NOT NULL AND
      "invoice_presentation" IN ('SEPARATE', 'AGGREGATE_ALLOWED') AND
      "component_snapshot" <> '{}' AND
      "component_snapshot_hash" ~ '^[0-9a-f]{64}$' AND
      "projection_status" IN ('PENDING_PROVISIONING', 'EXPANDED') AND
      (
        ("component_type" = 'TECHNOLOGY' AND
          NULLIF(BTRIM("entitlement_offer_type"), '') IS NOT NULL AND
          NULLIF(BTRIM("meter_definition_id"), '') IS NOT NULL AND
          "service_obligation_type" IS NULL) OR
        ("component_type" = 'HUMAN_SERVICE' AND
          NULLIF(BTRIM("service_obligation_type"), '') IS NOT NULL)
      )
    )
  );

CREATE INDEX "CommercialOrderLine_order_id_line_type_idx"
  ON "CommercialOrderLine"("order_id", "line_type");
CREATE INDEX "CommercialOrderLine_bundle_parent_product_id_idx"
  ON "CommercialOrderLine"("bundle_parent_product_id");
CREATE INDEX "CommercialOrderLine_projection_status_idx"
  ON "CommercialOrderLine"("projection_status");

ALTER TABLE "Entitlement" ADD COLUMN "bundle_order_line_id" TEXT;
CREATE UNIQUE INDEX "Entitlement_bundle_order_line_id_key"
  ON "Entitlement"("bundle_order_line_id");
ALTER TABLE "Entitlement"
  ADD CONSTRAINT "Entitlement_bundle_order_line_id_fkey"
  FOREIGN KEY ("bundle_order_line_id") REFERENCES "CommercialOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ServiceObligation" ADD COLUMN "bundle_order_line_id" TEXT;
CREATE UNIQUE INDEX "ServiceObligation_bundle_order_line_id_key"
  ON "ServiceObligation"("bundle_order_line_id");
ALTER TABLE "ServiceObligation"
  ADD CONSTRAINT "ServiceObligation_bundle_order_line_id_fkey"
  FOREIGN KEY ("bundle_order_line_id") REFERENCES "CommercialOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "BundleMeterProjection" (
  "id" TEXT NOT NULL,
  "order_line_id" TEXT NOT NULL,
  "contract_id" TEXT NOT NULL,
  "subscription_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "meter_definition_id" TEXT NOT NULL,
  "meter_authorization_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING_GOVERNANCE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BundleMeterProjection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BundleMeterProjection_status_check"
    CHECK ("status" IN ('PENDING_GOVERNANCE', 'PENDING_APPROVAL', 'AUTHORIZED', 'REJECTED'))
);
CREATE UNIQUE INDEX "BundleMeterProjection_order_line_id_key" ON "BundleMeterProjection"("order_line_id");
CREATE UNIQUE INDEX "BundleMeterProjection_meter_authorization_id_key" ON "BundleMeterProjection"("meter_authorization_id");
CREATE INDEX "BundleMeterProjection_contract_id_status_idx" ON "BundleMeterProjection"("contract_id", "status");
CREATE INDEX "BundleMeterProjection_tenant_id_environment_id_status_idx" ON "BundleMeterProjection"("tenant_id", "environment_id", "status");
ALTER TABLE "BundleMeterProjection"
  ADD CONSTRAINT "BundleMeterProjection_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "CommercialOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BundleMeterProjection_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BundleMeterProjection_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "CommercialSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BundleMeterProjection_meter_definition_id_fkey" FOREIGN KEY ("meter_definition_id") REFERENCES "MeterDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BundleMeterProjection_meter_authorization_id_fkey" FOREIGN KEY ("meter_authorization_id") REFERENCES "MeterAuthorizationPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "BundleCostAllocation" (
  "id" TEXT NOT NULL,
  "order_line_id" TEXT NOT NULL,
  "contract_id" TEXT NOT NULL,
  "subscription_id" TEXT NOT NULL,
  "cost_class" TEXT NOT NULL,
  "allocation_method" TEXT NOT NULL DEFAULT 'CATALOG_PERCENT',
  "allocation_percent" DECIMAL(5,2) NOT NULL,
  "allocated_revenue" DECIMAL(14,4) NOT NULL,
  "currency" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ALLOCATED',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BundleCostAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BundleCostAllocation_values_check" CHECK (
    "allocation_method" = 'CATALOG_PERCENT' AND
    "allocation_percent" > 0 AND "allocation_percent" <= 100 AND
    "allocated_revenue" >= 0 AND "status" = 'ALLOCATED'
  )
);
CREATE UNIQUE INDEX "BundleCostAllocation_order_line_id_key" ON "BundleCostAllocation"("order_line_id");
CREATE INDEX "BundleCostAllocation_contract_id_cost_class_idx" ON "BundleCostAllocation"("contract_id", "cost_class");
CREATE INDEX "BundleCostAllocation_subscription_id_idx" ON "BundleCostAllocation"("subscription_id");
ALTER TABLE "BundleCostAllocation"
  ADD CONSTRAINT "BundleCostAllocation_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "CommercialOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BundleCostAllocation_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BundleCostAllocation_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "CommercialSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "BundleClaimEligibility" (
  "id" TEXT NOT NULL,
  "order_line_id" TEXT NOT NULL,
  "contract_id" TEXT NOT NULL,
  "subscription_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "claim_key" TEXT NOT NULL,
  "claim_register_id" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'CONTRACT',
  "status" TEXT NOT NULL DEFAULT 'PENDING_EVALUATION',
  "reason_code" TEXT NOT NULL DEFAULT 'BUNDLE_COMPONENT_PENDING_EVALUATION',
  "evaluated_eligibility_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BundleClaimEligibility_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BundleClaimEligibility_status_check"
    CHECK ("status" IN ('PENDING_EVALUATION', 'ELIGIBLE', 'INELIGIBLE', 'EXPIRED'))
);
CREATE UNIQUE INDEX "BundleClaimEligibility_order_line_id_key" ON "BundleClaimEligibility"("order_line_id");
CREATE INDEX "BundleClaimEligibility_tenant_id_environment_id_claim_key_idx" ON "BundleClaimEligibility"("tenant_id", "environment_id", "claim_key");
CREATE INDEX "BundleClaimEligibility_contract_id_status_idx" ON "BundleClaimEligibility"("contract_id", "status");
ALTER TABLE "BundleClaimEligibility"
  ADD CONSTRAINT "BundleClaimEligibility_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "CommercialOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BundleClaimEligibility_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BundleClaimEligibility_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "CommercialSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BundleClaimEligibility_claim_register_id_fkey" FOREIGN KEY ("claim_register_id") REFERENCES "ClaimRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BundleClaimEligibility_evaluated_eligibility_id_fkey" FOREIGN KEY ("evaluated_eligibility_id") REFERENCES "ClaimEligibility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CommercialInvoiceLine"
  ADD COLUMN "presentation_mode" TEXT NOT NULL DEFAULT 'SEPARATE',
  ADD CONSTRAINT "CommercialInvoiceLine_presentation_mode_check"
    CHECK ("presentation_mode" IN ('SEPARATE', 'AGGREGATED'));

CREATE TABLE "CommercialInvoiceLineTrace" (
  "id" TEXT NOT NULL,
  "invoice_id" TEXT NOT NULL,
  "invoice_line_id" TEXT NOT NULL,
  "order_line_id" TEXT NOT NULL,
  "allocated_amount" DECIMAL(14,4) NOT NULL,
  "currency" TEXT NOT NULL,
  "service_period_start" TIMESTAMP(3) NOT NULL,
  "service_period_end" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommercialInvoiceLineTrace_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommercialInvoiceLineTrace_values_check" CHECK (
    "allocated_amount" >= 0 AND "service_period_end" > "service_period_start"
  )
);
CREATE UNIQUE INDEX "CommercialInvoiceLineTrace_invoice_id_order_line_id_service_key"
  ON "CommercialInvoiceLineTrace"("invoice_id", "order_line_id", "service_period_start", "service_period_end");
CREATE INDEX "CommercialInvoiceLineTrace_invoice_line_id_idx" ON "CommercialInvoiceLineTrace"("invoice_line_id");
CREATE INDEX "CommercialInvoiceLineTrace_order_line_id_idx" ON "CommercialInvoiceLineTrace"("order_line_id");
ALTER TABLE "CommercialInvoiceLineTrace"
  ADD CONSTRAINT "CommercialInvoiceLineTrace_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "CommercialInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CommercialInvoiceLineTrace_invoice_line_id_fkey" FOREIGN KEY ("invoice_line_id") REFERENCES "CommercialInvoiceLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CommercialInvoiceLineTrace_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "CommercialOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "enforce_bundle_projection_on_provision"() RETURNS trigger AS $$
DECLARE
  parent_record RECORD;
BEGIN
  IF NEW."status" = 'PROVISIONED' AND OLD."status" <> 'PROVISIONED' THEN
    FOR parent_record IN
      SELECT "bundle_parent_product_id",
             SUM("cost_allocation_percent") AS allocation_total,
             COUNT(*) FILTER (WHERE "component_type" = 'TECHNOLOGY') AS technology_count,
             COUNT(*) FILTER (WHERE "component_type" = 'HUMAN_SERVICE') AS service_count
      FROM "CommercialOrderLine"
      WHERE "order_id" = NEW."id" AND "line_type" = 'BUNDLE_COMPONENT'
      GROUP BY "bundle_parent_product_id"
    LOOP
      IF parent_record.allocation_total <> 100 OR
         parent_record.technology_count = 0 OR parent_record.service_count = 0 THEN
        RAISE EXCEPTION 'bundle must retain 100%% allocation and separate technology/human-service components';
      END IF;
    END LOOP;

    IF EXISTS (
      SELECT 1 FROM "CommercialOrderLine" line
      WHERE line."order_id" = NEW."id" AND line."line_type" = 'BUNDLE_COMPONENT' AND (
        line."projection_status" <> 'EXPANDED' OR
        NOT EXISTS (SELECT 1 FROM "BundleCostAllocation" cost WHERE cost."order_line_id" = line."id") OR
        NOT EXISTS (SELECT 1 FROM "BundleClaimEligibility" claim WHERE claim."order_line_id" = line."id") OR
        (line."component_type" = 'TECHNOLOGY' AND (
          NOT EXISTS (SELECT 1 FROM "Entitlement" ent WHERE ent."bundle_order_line_id" = line."id") OR
          NOT EXISTS (SELECT 1 FROM "BundleMeterProjection" meter WHERE meter."order_line_id" = line."id")
        )) OR
        (line."component_type" = 'HUMAN_SERVICE' AND
          NOT EXISTS (SELECT 1 FROM "ServiceObligation" obligation WHERE obligation."bundle_order_line_id" = line."id"))
      )
    ) THEN
      RAISE EXCEPTION 'order provisioning requires complete bundle component projections';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CommercialOrder_bundle_projection_guard"
  BEFORE UPDATE OF "status" ON "CommercialOrder"
  FOR EACH ROW EXECUTE FUNCTION "enforce_bundle_projection_on_provision"();

CREATE FUNCTION "enforce_invoice_bundle_trace"() RETURNS trigger AS $$
DECLARE
  line_record "CommercialInvoiceLine"%ROWTYPE;
  invoice_record "CommercialInvoice"%ROWTYPE;
  source_record RECORD;
BEGIN
  SELECT * INTO line_record FROM "CommercialInvoiceLine" WHERE "id" = NEW."invoice_line_id";
  SELECT * INTO invoice_record FROM "CommercialInvoice" WHERE "id" = NEW."invoice_id";
  SELECT source.*, orders."contract_id" AS source_contract_id, orders."status" AS source_order_status
    INTO source_record
    FROM "CommercialOrderLine" source
    JOIN "CommercialOrder" orders ON orders."id" = source."order_id"
    WHERE source."id" = NEW."order_line_id";

  IF line_record."invoice_id" <> NEW."invoice_id" OR
     line_record."service_period_start" <> NEW."service_period_start" OR
     line_record."service_period_end" <> NEW."service_period_end" OR
     invoice_record."currency" <> NEW."currency" OR
     source_record."line_type" <> 'BUNDLE_COMPONENT' OR source_record."billable" OR
     source_record."projection_status" <> 'EXPANDED' OR
     source_record.source_order_status <> 'PROVISIONED' OR
     source_record.source_contract_id <> invoice_record."contract_id" OR
     (line_record."presentation_mode" = 'AGGREGATED' AND source_record."invoice_presentation" <> 'AGGREGATE_ALLOWED') THEN
    RAISE EXCEPTION 'invoice bundle trace does not match its invoice, component, contract, period or presentation policy';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CommercialInvoiceLineTrace_integrity_guard"
  BEFORE INSERT OR UPDATE ON "CommercialInvoiceLineTrace"
  FOR EACH ROW EXECUTE FUNCTION "enforce_invoice_bundle_trace"();

CREATE FUNCTION "enforce_invoice_aggregation_before_issue"() RETURNS trigger AS $$
BEGIN
  IF NEW."status" = 'ISSUED' AND OLD."status" <> 'ISSUED' AND EXISTS (
    SELECT 1
    FROM "CommercialInvoiceLine" line
    LEFT JOIN "CommercialInvoiceLineTrace" trace ON trace."invoice_line_id" = line."id"
    LEFT JOIN "CommercialOrderLine" source ON source."id" = trace."order_line_id"
    WHERE line."invoice_id" = NEW."id" AND line."presentation_mode" = 'AGGREGATED'
    GROUP BY line."id", line."quantity", line."unit_price", line."discount_percent"
    HAVING COUNT(trace."id") < 2 OR
      ABS(COALESCE(SUM(trace."allocated_amount"), 0) -
        (line."quantity" * line."unit_price" * (1 - line."discount_percent" / 100))) > 0.0001 OR
      COUNT(DISTINCT source."bundle_parent_product_id") <> 1
  ) THEN
    RAISE EXCEPTION 'aggregated invoice line lacks complete bundle component traceability';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CommercialInvoice_bundle_trace_issue_guard"
  BEFORE UPDATE OF "status" ON "CommercialInvoice"
  FOR EACH ROW EXECUTE FUNCTION "enforce_invoice_aggregation_before_issue"();

CREATE FUNCTION "reject_issued_invoice_lineage_mutation"() RETURNS trigger AS $$
DECLARE
  target_invoice_id TEXT;
BEGIN
  target_invoice_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."invoice_id" ELSE NEW."invoice_id" END;
  IF EXISTS (SELECT 1 FROM "CommercialInvoice" WHERE "id" = target_invoice_id AND "status" = 'ISSUED') THEN
    RAISE EXCEPTION 'issued invoice lines and trace lineage are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CommercialInvoiceLine_issued_immutable"
  BEFORE INSERT OR UPDATE OR DELETE ON "CommercialInvoiceLine"
  FOR EACH ROW EXECUTE FUNCTION "reject_issued_invoice_lineage_mutation"();
CREATE TRIGGER "CommercialInvoiceLineTrace_issued_immutable"
  BEFORE INSERT OR UPDATE OR DELETE ON "CommercialInvoiceLineTrace"
  FOR EACH ROW EXECUTE FUNCTION "reject_issued_invoice_lineage_mutation"();
