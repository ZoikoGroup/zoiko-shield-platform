-- Category I batch 1: versioned, tenant-bound quote configuration and
-- independently verified regional CPQ readiness. Existing quotes are marked
-- MIGRATION_REVIEW and cannot advance until deliberately recreated; migration
-- must never manufacture a successful validation receipt.

ALTER TABLE "CommercialQuote"
  ADD COLUMN "tenant_id" TEXT,
  ADD COLUMN "environment_id" TEXT,
  ADD COLUMN "quote_key" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "supersedes_quote_id" TEXT,
  ADD COLUMN "configuration_hash" TEXT,
  ADD COLUMN "validation_status" TEXT NOT NULL DEFAULT 'PENDING_VALIDATION';

UPDATE "CommercialQuote"
SET
  "tenant_id" = 'MIGRATION_REVIEW',
  "environment_id" = 'MIGRATION_REVIEW',
  "quote_key" = "id",
  "configuration_hash" = repeat('0', 64),
  "validation_status" = 'MIGRATION_REVIEW';

ALTER TABLE "CommercialQuote"
  ALTER COLUMN "tenant_id" SET NOT NULL,
  ALTER COLUMN "environment_id" SET NOT NULL,
  ALTER COLUMN "quote_key" SET NOT NULL,
  ALTER COLUMN "configuration_hash" SET NOT NULL,
  ADD CONSTRAINT "CommercialQuote_status_check" CHECK (
    "status" IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXPIRED', 'CONVERTED', 'CANCELLED')
  ),
  ADD CONSTRAINT "CommercialQuote_validation_status_check" CHECK (
    "validation_status" IN ('PENDING_VALIDATION', 'VALIDATED', 'FAILED', 'MIGRATION_REVIEW')
  ),
  ADD CONSTRAINT "CommercialQuote_identity_check" CHECK (
    NULLIF(BTRIM("tenant_id"), '') IS NOT NULL AND
    NULLIF(BTRIM("environment_id"), '') IS NOT NULL AND
    NULLIF(BTRIM("quote_key"), '') IS NOT NULL AND
    "version" > 0 AND
    "term_months" > 0
  ),
  ADD CONSTRAINT "CommercialQuote_configuration_hash_check" CHECK (
    "configuration_hash" ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT "CommercialQuote_snapshot_json_check" CHECK (
    jsonb_typeof("snapshot"::jsonb) = 'object'
  );

CREATE UNIQUE INDEX "CommercialQuote_supersedes_quote_id_key"
  ON "CommercialQuote"("supersedes_quote_id");
CREATE UNIQUE INDEX "CommercialQuote_commercial_account_id_quote_key_version_key"
  ON "CommercialQuote"("commercial_account_id", "quote_key", "version");
CREATE INDEX "CommercialQuote_tenant_id_environment_id_status_idx"
  ON "CommercialQuote"("tenant_id", "environment_id", "status");

ALTER TABLE "CommercialQuote"
  ADD CONSTRAINT "CommercialQuote_supersedes_quote_id_fkey"
  FOREIGN KEY ("supersedes_quote_id") REFERENCES "CommercialQuote"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CpqOfferReadiness" (
  "id" TEXT NOT NULL,
  "catalog_version_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "retention_profiles" TEXT NOT NULL DEFAULT '[]',
  "service_tiers" TEXT NOT NULL DEFAULT '[]',
  "supported_connector_keys" TEXT NOT NULL DEFAULT '[]',
  "obligation_types" TEXT NOT NULL DEFAULT '[]',
  "service_capacity_status" TEXT NOT NULL,
  "market_availability_status" TEXT NOT NULL,
  "claim_eligibility_status" TEXT NOT NULL,
  "evidence_refs" TEXT NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'VERIFIED',
  "verified_by" TEXT NOT NULL,
  "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effective_to" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CpqOfferReadiness_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CpqOfferReadiness_identity_check" CHECK (
    NULLIF(BTRIM("region"), '') IS NOT NULL AND "version" > 0 AND
    NULLIF(BTRIM("verified_by"), '') IS NOT NULL
  ),
  CONSTRAINT "CpqOfferReadiness_capacity_check" CHECK (
    "service_capacity_status" IN ('AVAILABLE', 'LIMITED', 'UNAVAILABLE', 'NOT_APPLICABLE')
  ),
  CONSTRAINT "CpqOfferReadiness_market_check" CHECK (
    "market_availability_status" IN ('AVAILABLE', 'UNAVAILABLE')
  ),
  CONSTRAINT "CpqOfferReadiness_claim_check" CHECK (
    "claim_eligibility_status" IN ('ELIGIBLE', 'CONDITIONAL', 'INELIGIBLE', 'NOT_APPLICABLE')
  ),
  CONSTRAINT "CpqOfferReadiness_status_check" CHECK ("status" = 'VERIFIED'),
  CONSTRAINT "CpqOfferReadiness_dates_check" CHECK (
    "effective_to" IS NULL OR "effective_to" > "effective_from"
  ),
  CONSTRAINT "CpqOfferReadiness_arrays_check" CHECK (
    jsonb_typeof("retention_profiles"::jsonb) = 'array' AND
    jsonb_array_length("retention_profiles"::jsonb) > 0 AND
    jsonb_typeof("service_tiers"::jsonb) = 'array' AND
    jsonb_array_length("service_tiers"::jsonb) > 0 AND
    jsonb_typeof("supported_connector_keys"::jsonb) = 'array' AND
    jsonb_typeof("obligation_types"::jsonb) = 'array' AND
    jsonb_typeof("evidence_refs"::jsonb) = 'array' AND
    jsonb_array_length("evidence_refs"::jsonb) > 0
  )
);

CREATE UNIQUE INDEX "CpqOfferReadiness_product_id_region_version_key"
  ON "CpqOfferReadiness"("product_id", "region", "version");
CREATE INDEX "CpqOfferReadiness_catalog_version_id_region_status_idx"
  ON "CpqOfferReadiness"("catalog_version_id", "region", "status");
CREATE INDEX "CpqOfferReadiness_product_id_region_status_effective_from_idx"
  ON "CpqOfferReadiness"("product_id", "region", "status", "effective_from");

ALTER TABLE "CpqOfferReadiness"
  ADD CONSTRAINT "CpqOfferReadiness_catalog_version_id_fkey"
  FOREIGN KEY ("catalog_version_id") REFERENCES "CatalogVersion"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CpqOfferReadiness"
  ADD CONSTRAINT "CpqOfferReadiness_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "Product"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CommercialQuoteValidation" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "quote_id" TEXT NOT NULL,
  "configuration_hash" TEXT NOT NULL,
  "readiness_record_ids" TEXT NOT NULL DEFAULT '[]',
  "price_book_ids" TEXT NOT NULL DEFAULT '[]',
  "tax_rule_id" TEXT NOT NULL,
  "dependency_status" TEXT NOT NULL,
  "incompatibility_status" TEXT NOT NULL,
  "unit_economics_status" TEXT NOT NULL,
  "service_capacity_status" TEXT NOT NULL,
  "market_availability_status" TEXT NOT NULL,
  "claim_eligibility_status" TEXT NOT NULL,
  "partner_economics_status" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "validated_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommercialQuoteValidation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommercialQuoteValidation_identity_check" CHECK (
    NULLIF(BTRIM("tenant_id"), '') IS NOT NULL AND
    NULLIF(BTRIM("environment_id"), '') IS NOT NULL AND
    NULLIF(BTRIM("validated_by"), '') IS NOT NULL
  ),
  CONSTRAINT "CommercialQuoteValidation_hash_check" CHECK (
    "configuration_hash" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "CommercialQuoteValidation_arrays_check" CHECK (
    jsonb_typeof("readiness_record_ids"::jsonb) = 'array' AND
    jsonb_array_length("readiness_record_ids"::jsonb) > 0 AND
    jsonb_typeof("price_book_ids"::jsonb) = 'array' AND
    jsonb_array_length("price_book_ids"::jsonb) > 0
  ),
  CONSTRAINT "CommercialQuoteValidation_checks_check" CHECK (
    "dependency_status" IN ('PASS', 'FAIL') AND
    "incompatibility_status" IN ('PASS', 'FAIL') AND
    "unit_economics_status" IN ('PASS', 'FAIL') AND
    "service_capacity_status" IN ('PASS', 'FAIL') AND
    "market_availability_status" IN ('PASS', 'FAIL') AND
    "claim_eligibility_status" IN ('PASS', 'FAIL') AND
    "partner_economics_status" IN ('APPROVED', 'NOT_APPLICABLE', 'FAIL') AND
    "result" IN ('PASS', 'FAIL')
  ),
  CONSTRAINT "CommercialQuoteValidation_pass_check" CHECK (
    "result" <> 'PASS' OR (
      "dependency_status" = 'PASS' AND
      "incompatibility_status" = 'PASS' AND
      "unit_economics_status" = 'PASS' AND
      "service_capacity_status" = 'PASS' AND
      "market_availability_status" = 'PASS' AND
      "claim_eligibility_status" = 'PASS' AND
      "partner_economics_status" IN ('APPROVED', 'NOT_APPLICABLE')
    )
  )
);

CREATE UNIQUE INDEX "CommercialQuoteValidation_quote_id_key"
  ON "CommercialQuoteValidation"("quote_id");
CREATE INDEX "CommercialQuoteValidation_tenant_id_environment_id_created__idx"
  ON "CommercialQuoteValidation"("tenant_id", "environment_id", "created_at");
CREATE INDEX "CommercialQuoteValidation_result_created_at_idx"
  ON "CommercialQuoteValidation"("result", "created_at");

ALTER TABLE "CommercialQuoteValidation"
  ADD CONSTRAINT "CommercialQuoteValidation_quote_id_fkey"
  FOREIGN KEY ("quote_id") REFERENCES "CommercialQuote"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CommercialQuoteLine"
  ADD CONSTRAINT "CommercialQuoteLine_values_check" CHECK (
    "quantity" > 0 AND "unit_price" >= 0 AND
    "line_discount_percent" >= 0 AND "line_discount_percent" <= 100
  );

-- The platform readiness verifier is separate from tenant Sales authority.
-- It may append only the next version and only for a released product in the
-- same approved catalog version.
CREATE FUNCTION "enforce_cpq_offer_readiness_insert"() RETURNS trigger AS $$
DECLARE
  expected_version INTEGER;
BEGIN
  PERFORM 1
  FROM "Product" product
  JOIN "CatalogVersion" catalog ON catalog."id" = product."catalog_version_id"
  WHERE product."id" = NEW."product_id"
    AND product."catalog_version_id" = NEW."catalog_version_id"
    AND product."release_status" = 'RELEASED'
    AND catalog."status" = 'APPROVED';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CPQ readiness requires a released product in its approved catalog version';
  END IF;

  SELECT COALESCE(MAX("version"), 0) + 1 INTO expected_version
  FROM "CpqOfferReadiness"
  WHERE "product_id" = NEW."product_id" AND "region" = NEW."region";
  IF NEW."version" <> expected_version THEN
    RAISE EXCEPTION 'CPQ readiness version must append as %, received %', expected_version, NEW."version";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CpqOfferReadiness_insert_guard"
  BEFORE INSERT ON "CpqOfferReadiness"
  FOR EACH ROW EXECUTE FUNCTION "enforce_cpq_offer_readiness_insert"();

-- Validation is accepted only when its protected references are current and
-- permissive at creation time. The quote stores their exact IDs thereafter.
CREATE FUNCTION "enforce_commercial_quote_validation_insert"() RETURNS trigger AS $$
DECLARE
  quote_record "CommercialQuote"%ROWTYPE;
  reference_id TEXT;
BEGIN
  SELECT * INTO quote_record FROM "CommercialQuote" WHERE "id" = NEW."quote_id";
  IF NOT FOUND OR
     quote_record."tenant_id" <> NEW."tenant_id" OR
     quote_record."environment_id" <> NEW."environment_id" OR
     quote_record."configuration_hash" <> NEW."configuration_hash" OR
     quote_record."status" <> 'DRAFT' OR
     quote_record."validation_status" <> 'VALIDATED' THEN
    RAISE EXCEPTION 'quote validation must match the tenant, environment, hash and draft quote';
  END IF;

  FOR reference_id IN SELECT jsonb_array_elements_text(NEW."readiness_record_ids"::jsonb)
  LOOP
    PERFORM 1 FROM "CpqOfferReadiness"
    WHERE "id" = reference_id
      AND "catalog_version_id" = quote_record."catalog_version_id"
      AND "region" = quote_record."region"
      AND "status" = 'VERIFIED'
      AND "effective_from" <= NEW."created_at"
      AND ("effective_to" IS NULL OR "effective_to" >= NEW."created_at")
      AND "service_capacity_status" IN ('AVAILABLE', 'NOT_APPLICABLE')
      AND "market_availability_status" = 'AVAILABLE'
      AND "claim_eligibility_status" IN ('ELIGIBLE', 'NOT_APPLICABLE');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'quote validation references unavailable readiness %', reference_id;
    END IF;
  END LOOP;

  FOR reference_id IN SELECT jsonb_array_elements_text(NEW."price_book_ids"::jsonb)
  LOOP
    PERFORM 1 FROM "PriceBook"
    WHERE "id" = reference_id
      AND "catalog_version_id" = quote_record."catalog_version_id"
      AND "status" = 'APPROVED'
      AND "margin_gate_passed"
      AND "effective_from" <= NEW."created_at"
      AND ("effective_to" IS NULL OR "effective_to" >= NEW."created_at");
    IF NOT FOUND THEN
      RAISE EXCEPTION 'quote validation references unapproved price book %', reference_id;
    END IF;
  END LOOP;

  PERFORM 1 FROM "TaxRule"
  WHERE "id" = NEW."tax_rule_id"
    AND "status" = 'APPROVED'
    AND "effective_from" <= NEW."created_at"
    AND ("effective_to" IS NULL OR "effective_to" >= NEW."created_at");
  IF NOT FOUND THEN
    RAISE EXCEPTION 'quote validation references an unapproved tax rule';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CommercialQuoteValidation_insert_guard"
  BEFORE INSERT ON "CommercialQuoteValidation"
  FOR EACH ROW EXECUTE FUNCTION "enforce_commercial_quote_validation_insert"();

CREATE FUNCTION "reject_category_i_receipt_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'CPQ readiness and quote validation receipts are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CpqOfferReadiness_no_update"
  BEFORE UPDATE ON "CpqOfferReadiness"
  FOR EACH ROW EXECUTE FUNCTION "reject_category_i_receipt_mutation"();
CREATE TRIGGER "CpqOfferReadiness_no_delete"
  BEFORE DELETE ON "CpqOfferReadiness"
  FOR EACH ROW EXECUTE FUNCTION "reject_category_i_receipt_mutation"();
CREATE TRIGGER "CommercialQuoteValidation_no_update"
  BEFORE UPDATE ON "CommercialQuoteValidation"
  FOR EACH ROW EXECUTE FUNCTION "reject_category_i_receipt_mutation"();
CREATE TRIGGER "CommercialQuoteValidation_no_delete"
  BEFORE DELETE ON "CommercialQuoteValidation"
  FOR EACH ROW EXECUTE FUNCTION "reject_category_i_receipt_mutation"();

CREATE FUNCTION "enforce_commercial_quote_lifecycle"() RETURNS trigger AS $$
DECLARE
  validation_ok BOOLEAN;
  approval_ok BOOLEAN;
BEGIN
  IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id" OR
     NEW."environment_id" IS DISTINCT FROM OLD."environment_id" OR
     NEW."commercial_account_id" IS DISTINCT FROM OLD."commercial_account_id" OR
     NEW."catalog_version_id" IS DISTINCT FROM OLD."catalog_version_id" OR
     NEW."quote_key" IS DISTINCT FROM OLD."quote_key" OR
     NEW."version" IS DISTINCT FROM OLD."version" OR
     NEW."supersedes_quote_id" IS DISTINCT FROM OLD."supersedes_quote_id" OR
     NEW."currency" IS DISTINCT FROM OLD."currency" OR
     NEW."region" IS DISTINCT FROM OLD."region" OR
     NEW."term_months" IS DISTINCT FROM OLD."term_months" OR
     NEW."requires_approval" IS DISTINCT FROM OLD."requires_approval" OR
     NEW."snapshot" IS DISTINCT FROM OLD."snapshot" OR
     NEW."configuration_hash" IS DISTINCT FROM OLD."configuration_hash" OR
     NEW."validation_status" IS DISTINCT FROM OLD."validation_status" OR
     NEW."requested_by" IS DISTINCT FROM OLD."requested_by" OR
     NEW."expires_at" IS DISTINCT FROM OLD."expires_at" THEN
    RAISE EXCEPTION 'versioned quote configuration is immutable; create a new quote revision';
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF NOT (
      (OLD."status" = 'DRAFT' AND NEW."status" IN ('PENDING_APPROVAL', 'CANCELLED', 'EXPIRED')) OR
      (OLD."status" = 'PENDING_APPROVAL' AND NEW."status" IN ('APPROVED', 'REJECTED', 'DRAFT', 'CANCELLED', 'EXPIRED')) OR
      (OLD."status" = 'APPROVED' AND NEW."status" IN ('CONVERTED', 'EXPIRED', 'CANCELLED'))
    ) THEN
      RAISE EXCEPTION 'invalid commercial quote transition from % to %', OLD."status", NEW."status";
    END IF;
  END IF;

  IF NEW."status" IN ('PENDING_APPROVAL', 'APPROVED', 'CONVERTED') THEN
    SELECT EXISTS (
      SELECT 1 FROM "CommercialQuoteValidation" validation
      WHERE validation."quote_id" = NEW."id"
        AND validation."tenant_id" = NEW."tenant_id"
        AND validation."environment_id" = NEW."environment_id"
        AND validation."configuration_hash" = NEW."configuration_hash"
        AND validation."result" = 'PASS'
    ) INTO validation_ok;
    IF NEW."validation_status" <> 'VALIDATED' OR NOT validation_ok THEN
      RAISE EXCEPTION 'quote transition requires its exact successful immutable validation receipt';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM "CommercialQuoteLine"
    WHERE "quote_id" = NEW."id" AND "line_discount_percent" > 0
  ) AND NOT NEW."requires_approval" THEN
    RAISE EXCEPTION 'discounted quote must require commercial approval';
  END IF;

  IF NEW."status" = 'APPROVED' THEN
    IF NEW."approved_by" IS NULL OR NEW."approved_by" = NEW."requested_by" THEN
      RAISE EXCEPTION 'quote approval requires a distinct named approver';
    END IF;
    IF NEW."expires_at" IS NOT NULL AND NEW."expires_at" <= CURRENT_TIMESTAMP THEN
      RAISE EXCEPTION 'expired quote cannot be approved';
    END IF;
    IF NEW."requires_approval" THEN
      SELECT EXISTS (
        SELECT 1 FROM "CommercialApproval"
        WHERE "id" = NEW."approval_id"
          AND "object_type" = 'CommercialQuote'
          AND "object_id" = NEW."id"
          AND "status" IN ('APPROVED', 'APPLIED')
      ) INTO approval_ok;
      IF NOT approval_ok THEN
        RAISE EXCEPTION 'discounted quote requires its approved maker-checker record';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CommercialQuote_lifecycle_guard"
  BEFORE UPDATE ON "CommercialQuote"
  FOR EACH ROW EXECUTE FUNCTION "enforce_commercial_quote_lifecycle"();

CREATE FUNCTION "enforce_commercial_quote_line_mutation"() RETURNS trigger AS $$
DECLARE
  parent_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT "status" INTO parent_status FROM "CommercialQuote"
    WHERE "id" = OLD."quote_id";
  ELSE
    SELECT "status" INTO parent_status FROM "CommercialQuote"
    WHERE "id" = NEW."quote_id";
  END IF;
  IF parent_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'quote lines are immutable outside DRAFT; create a new quote revision';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CommercialQuoteLine_mutation_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "CommercialQuoteLine"
  FOR EACH ROW EXECUTE FUNCTION "enforce_commercial_quote_line_mutation"();
