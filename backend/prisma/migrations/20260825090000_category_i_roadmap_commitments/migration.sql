-- Category I batch 2: conditional roadmap language is stored separately from
-- quoted products and entitlements, approved independently by Legal/Product,
-- and remains non-entitling even after its release gate passes.

CREATE TABLE "RoadmapCommitment" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "quote_id" TEXT NOT NULL,
  "commitment_key" TEXT NOT NULL,
  "target_product_id" TEXT NOT NULL,
  "target_catalog_version_id" TEXT NOT NULL,
  "feature_key" TEXT NOT NULL,
  "non_ga_language" TEXT NOT NULL,
  "conditions" TEXT NOT NULL DEFAULT '[]',
  "delivery_dependency_type" TEXT NOT NULL,
  "delivery_dependency_reference" TEXT NOT NULL,
  "target_delivery_date" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "entitlement_effect" TEXT NOT NULL DEFAULT 'NONE',
  "runtime_access_status" TEXT NOT NULL DEFAULT 'DISABLED',
  "legal_approval_id" TEXT,
  "product_approval_id" TEXT,
  "submitted_by" TEXT,
  "submitted_at" TIMESTAMP(3),
  "legal_approved_by" TEXT,
  "legal_approved_at" TIMESTAMP(3),
  "product_approved_by" TEXT,
  "product_approved_at" TIMESTAMP(3),
  "release_gate_evidence_refs" TEXT NOT NULL DEFAULT '[]',
  "release_gate_passed_by" TEXT,
  "release_gate_passed_at" TIMESTAMP(3),
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RoadmapCommitment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RoadmapCommitment_identity_check" CHECK (
    NULLIF(BTRIM("tenant_id"), '') IS NOT NULL AND
    NULLIF(BTRIM("environment_id"), '') IS NOT NULL AND
    NULLIF(BTRIM("commitment_key"), '') IS NOT NULL AND
    NULLIF(BTRIM("feature_key"), '') IS NOT NULL AND
    NULLIF(BTRIM("created_by"), '') IS NOT NULL
  ),
  CONSTRAINT "RoadmapCommitment_non_ga_language_check" CHECK (
    LENGTH(BTRIM("non_ga_language")) >= 20 AND
    "non_ga_language" ~* '(non[ -]?ga|not generally available)' AND
    "non_ga_language" ~* '(conditional|subject to|not guaranteed)'
  ),
  CONSTRAINT "RoadmapCommitment_conditions_check" CHECK (
    jsonb_typeof("conditions"::jsonb) = 'array' AND
    jsonb_array_length("conditions"::jsonb) > 0
  ),
  CONSTRAINT "RoadmapCommitment_dependency_check" CHECK (
    "delivery_dependency_type" IN ('PRODUCT_RELEASE', 'DELIVERY_MILESTONE', 'THIRD_PARTY_DEPENDENCY') AND
    NULLIF(BTRIM("delivery_dependency_reference"), '') IS NOT NULL
  ),
  CONSTRAINT "RoadmapCommitment_status_check" CHECK (
    "status" IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'RELEASE_GATE_PASSED')
  ),
  CONSTRAINT "RoadmapCommitment_entitlement_boundary_check" CHECK (
    "entitlement_effect" = 'NONE' AND
    "runtime_access_status" IN ('DISABLED', 'ELIGIBLE_FOR_SEPARATE_ORDER') AND
    ("status" = 'RELEASE_GATE_PASSED' OR "runtime_access_status" = 'DISABLED') AND
    ("status" <> 'RELEASE_GATE_PASSED' OR "runtime_access_status" = 'ELIGIBLE_FOR_SEPARATE_ORDER')
  ),
  CONSTRAINT "RoadmapCommitment_release_evidence_check" CHECK (
    jsonb_typeof("release_gate_evidence_refs"::jsonb) = 'array' AND
    ("status" <> 'RELEASE_GATE_PASSED' OR (
      jsonb_array_length("release_gate_evidence_refs"::jsonb) > 0 AND
      "release_gate_passed_by" IS NOT NULL AND
      "release_gate_passed_at" IS NOT NULL
    ))
  ),
  CONSTRAINT "RoadmapCommitment_approval_fields_check" CHECK (
    "status" NOT IN ('APPROVED', 'RELEASE_GATE_PASSED') OR (
      "legal_approval_id" IS NOT NULL AND
      "product_approval_id" IS NOT NULL AND
      "legal_approved_by" IS NOT NULL AND
      "legal_approved_at" IS NOT NULL AND
      "product_approved_by" IS NOT NULL AND
      "product_approved_at" IS NOT NULL AND
      "legal_approved_by" <> "product_approved_by"
    )
  )
);

CREATE UNIQUE INDEX "RoadmapCommitment_legal_approval_id_key"
  ON "RoadmapCommitment"("legal_approval_id");
CREATE UNIQUE INDEX "RoadmapCommitment_product_approval_id_key"
  ON "RoadmapCommitment"("product_approval_id");
CREATE UNIQUE INDEX "RoadmapCommitment_quote_id_commitment_key_key"
  ON "RoadmapCommitment"("quote_id", "commitment_key");
CREATE UNIQUE INDEX "RoadmapCommitment_quote_id_feature_key_key"
  ON "RoadmapCommitment"("quote_id", "feature_key");
CREATE INDEX "RoadmapCommitment_tenant_id_environment_id_status_idx"
  ON "RoadmapCommitment"("tenant_id", "environment_id", "status");
CREATE INDEX "RoadmapCommitment_target_product_id_status_idx"
  ON "RoadmapCommitment"("target_product_id", "status");
CREATE INDEX "RoadmapCommitment_quote_id_status_idx"
  ON "RoadmapCommitment"("quote_id", "status");

ALTER TABLE "RoadmapCommitment"
  ADD CONSTRAINT "RoadmapCommitment_quote_id_fkey"
  FOREIGN KEY ("quote_id") REFERENCES "CommercialQuote"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoadmapCommitment"
  ADD CONSTRAINT "RoadmapCommitment_target_product_id_fkey"
  FOREIGN KEY ("target_product_id") REFERENCES "Product"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoadmapCommitment"
  ADD CONSTRAINT "RoadmapCommitment_target_catalog_version_id_fkey"
  FOREIGN KEY ("target_catalog_version_id") REFERENCES "CatalogVersion"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoadmapCommitment"
  ADD CONSTRAINT "RoadmapCommitment_legal_approval_id_fkey"
  FOREIGN KEY ("legal_approval_id") REFERENCES "CommercialApproval"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoadmapCommitment"
  ADD CONSTRAINT "RoadmapCommitment_product_approval_id_fkey"
  FOREIGN KEY ("product_approval_id") REFERENCES "CommercialApproval"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "enforce_roadmap_commitment_lifecycle"() RETURNS trigger AS $$
DECLARE
  quote_record "CommercialQuote"%ROWTYPE;
  product_record "Product"%ROWTYPE;
  catalog_status TEXT;
  legal_record "CommercialApproval"%ROWTYPE;
  product_approval_record "CommercialApproval"%ROWTYPE;
BEGIN
  SELECT * INTO quote_record FROM "CommercialQuote" WHERE "id" = NEW."quote_id";
  SELECT * INTO product_record FROM "Product" WHERE "id" = NEW."target_product_id";
  SELECT "status" INTO catalog_status FROM "CatalogVersion"
    WHERE "id" = NEW."target_catalog_version_id";

  IF NOT FOUND OR product_record."catalog_version_id" <> NEW."target_catalog_version_id" THEN
    RAISE EXCEPTION 'roadmap target product must match its frozen target catalog version';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF quote_record."tenant_id" <> NEW."tenant_id" OR
       quote_record."environment_id" <> NEW."environment_id" OR
       quote_record."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'roadmap commitment requires its exact tenant-bound DRAFT quote';
    END IF;
    IF product_record."release_status" = 'RELEASED' OR catalog_status <> 'DRAFT' THEN
      RAISE EXCEPTION 'roadmap target must be unreleased in a future DRAFT catalog';
    END IF;
    PERFORM 1 FROM "CommercialQuoteLine"
    WHERE "quote_id" = NEW."quote_id" AND "product_id" = NEW."target_product_id";
    IF FOUND THEN
      RAISE EXCEPTION 'roadmap target cannot also be a quoted product line';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id" OR
     NEW."environment_id" IS DISTINCT FROM OLD."environment_id" OR
     NEW."quote_id" IS DISTINCT FROM OLD."quote_id" OR
     NEW."commitment_key" IS DISTINCT FROM OLD."commitment_key" OR
     NEW."target_product_id" IS DISTINCT FROM OLD."target_product_id" OR
     NEW."target_catalog_version_id" IS DISTINCT FROM OLD."target_catalog_version_id" OR
     NEW."feature_key" IS DISTINCT FROM OLD."feature_key" OR
     NEW."non_ga_language" IS DISTINCT FROM OLD."non_ga_language" OR
     NEW."conditions" IS DISTINCT FROM OLD."conditions" OR
     NEW."delivery_dependency_type" IS DISTINCT FROM OLD."delivery_dependency_type" OR
     NEW."delivery_dependency_reference" IS DISTINCT FROM OLD."delivery_dependency_reference" OR
     NEW."target_delivery_date" IS DISTINCT FROM OLD."target_delivery_date" OR
     NEW."entitlement_effect" IS DISTINCT FROM OLD."entitlement_effect" OR
     NEW."created_by" IS DISTINCT FROM OLD."created_by" THEN
    RAISE EXCEPTION 'submitted roadmap language and delivery dependency are immutable';
  END IF;

  IF OLD."status" <> 'DRAFT' AND (
    NEW."legal_approval_id" IS DISTINCT FROM OLD."legal_approval_id" OR
    NEW."product_approval_id" IS DISTINCT FROM OLD."product_approval_id" OR
    NEW."submitted_by" IS DISTINCT FROM OLD."submitted_by" OR
    NEW."submitted_at" IS DISTINCT FROM OLD."submitted_at"
  ) THEN
    RAISE EXCEPTION 'submitted roadmap approval identities are immutable';
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" = 'PENDING_APPROVAL') OR
    (OLD."status" = 'PENDING_APPROVAL' AND NEW."status" IN ('APPROVED', 'REJECTED')) OR
    (OLD."status" = 'APPROVED' AND NEW."status" = 'RELEASE_GATE_PASSED')
  ) THEN
    RAISE EXCEPTION 'invalid roadmap commitment transition from % to %', OLD."status", NEW."status";
  END IF;

  IF NEW."status" IN ('PENDING_APPROVAL', 'APPROVED', 'RELEASE_GATE_PASSED') THEN
    SELECT * INTO legal_record FROM "CommercialApproval"
    WHERE "id" = NEW."legal_approval_id"
      AND "object_type" = 'RoadmapCommitment'
      AND "object_id" = NEW."id"
      AND "change_type" = 'ROADMAP_LEGAL_REVIEW'
      AND "required_approval_role" = 'LEGAL_APPROVER';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'roadmap commitment requires its Legal approval record';
    END IF;
    SELECT * INTO product_approval_record FROM "CommercialApproval"
    WHERE "id" = NEW."product_approval_id"
      AND "object_type" = 'RoadmapCommitment'
      AND "object_id" = NEW."id"
      AND "change_type" = 'ROADMAP_PRODUCT_REVIEW'
      AND "required_approval_role" = 'PRODUCT_APPROVER';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'roadmap commitment requires its Product approval record';
    END IF;
  END IF;

  IF NEW."status" IN ('APPROVED', 'RELEASE_GATE_PASSED') THEN
    IF legal_record."status" NOT IN ('APPROVED', 'APPLIED') OR
       product_approval_record."status" NOT IN ('APPROVED', 'APPLIED') OR
       legal_record."approved_by" IS NULL OR
       product_approval_record."approved_by" IS NULL OR
       legal_record."approved_by" = product_approval_record."approved_by" OR
       NEW."legal_approved_by" IS DISTINCT FROM legal_record."approved_by" OR
       NEW."product_approved_by" IS DISTINCT FROM product_approval_record."approved_by" THEN
      RAISE EXCEPTION 'roadmap commitment requires distinct approved Legal and Product authorities';
    END IF;
  END IF;

  IF NEW."status" = 'RELEASE_GATE_PASSED' THEN
    IF product_record."release_status" <> 'RELEASED' OR catalog_status <> 'APPROVED' THEN
      RAISE EXCEPTION 'roadmap release gate requires a RELEASED product in an APPROVED catalog';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RoadmapCommitment_lifecycle_guard"
  BEFORE INSERT OR UPDATE ON "RoadmapCommitment"
  FOR EACH ROW EXECUTE FUNCTION "enforce_roadmap_commitment_lifecycle"();

CREATE FUNCTION "reject_roadmap_commitment_delete"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'roadmap commitments are retained commercial history and cannot be deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RoadmapCommitment_no_delete"
  BEFORE DELETE ON "RoadmapCommitment"
  FOR EACH ROW EXECUTE FUNCTION "reject_roadmap_commitment_delete"();

CREATE FUNCTION "enforce_quote_roadmap_approval_gate"() RETURNS trigger AS $$
BEGIN
  IF NEW."status" IN ('PENDING_APPROVAL', 'APPROVED', 'CONVERTED') AND EXISTS (
    SELECT 1 FROM "RoadmapCommitment" commitment
    LEFT JOIN "CommercialApproval" legal ON legal."id" = commitment."legal_approval_id"
    LEFT JOIN "CommercialApproval" product ON product."id" = commitment."product_approval_id"
    WHERE commitment."quote_id" = NEW."id" AND (
      commitment."status" NOT IN ('APPROVED', 'RELEASE_GATE_PASSED') OR
      commitment."entitlement_effect" <> 'NONE' OR
      COALESCE(legal."status", 'MISSING') NOT IN ('APPROVED', 'APPLIED') OR
      COALESCE(product."status", 'MISSING') NOT IN ('APPROVED', 'APPLIED') OR
      legal."approved_by" IS NULL OR product."approved_by" IS NULL OR
      legal."approved_by" = product."approved_by"
    )
  ) THEN
    RAISE EXCEPTION 'quote transition blocked by an unapproved or entitling roadmap commitment';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CommercialQuote_roadmap_approval_guard"
  BEFORE UPDATE ON "CommercialQuote"
  FOR EACH ROW EXECUTE FUNCTION "enforce_quote_roadmap_approval_gate"();

CREATE FUNCTION "enforce_quote_line_not_roadmap"() RETURNS trigger AS $$
BEGIN
  PERFORM 1 FROM "RoadmapCommitment"
  WHERE "quote_id" = NEW."quote_id" AND "target_product_id" = NEW."product_id";
  IF FOUND THEN
    RAISE EXCEPTION 'roadmap target cannot be inserted as a current quote line';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CommercialQuoteLine_roadmap_guard"
  BEFORE INSERT OR UPDATE ON "CommercialQuoteLine"
  FOR EACH ROW EXECUTE FUNCTION "enforce_quote_line_not_roadmap"();

CREATE FUNCTION "enforce_entitlement_not_from_roadmap"() RETURNS trigger AS $$
BEGIN
  IF NEW."source_type" = 'ROADMAP_COMMITMENT' OR (
    NEW."source_id" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "RoadmapCommitment" WHERE "id" = NEW."source_id"
    )
  ) THEN
    RAISE EXCEPTION 'roadmap commitment can never create current entitlement; a separate accepted order is required';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Entitlement_roadmap_source_guard"
  BEFORE INSERT OR UPDATE OF "source_type", "source_id" ON "Entitlement"
  FOR EACH ROW EXECUTE FUNCTION "enforce_entitlement_not_from_roadmap"();
