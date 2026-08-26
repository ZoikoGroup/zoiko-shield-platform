-- Category I3: margin-aware discount escalation. Commercial approval is kept
-- separate from technical CPQ authority and is bound to a frozen economics
-- review containing service-class margin, partner pass-through, term, ramp,
-- minimum commit, expiry and the exact required authority tier.

CREATE TABLE "DiscountAuthorityPolicy" (
  "id" TEXT NOT NULL,
  "policy_key" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "supersedes_policy_id" TEXT,
  "service_class" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "standard_margin_floor_percent" DECIMAL(6,2) NOT NULL,
  "finance_margin_floor_percent" DECIMAL(6,2) NOT NULL,
  "absolute_margin_floor_percent" DECIMAL(6,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  "effective_from" TIMESTAMP(3) NOT NULL,
  "effective_to" TIMESTAMP(3),
  "requested_by" TEXT NOT NULL,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decided_by" TEXT,
  "decided_at" TIMESTAMP(3),
  "decision_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiscountAuthorityPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DiscountAuthorityPolicy_identity_check" CHECK (
    NULLIF(BTRIM("policy_key"), '') IS NOT NULL AND
    NULLIF(BTRIM("service_class"), '') IS NOT NULL AND
    NULLIF(BTRIM("region"), '') IS NOT NULL AND
    NULLIF(BTRIM("currency"), '') IS NOT NULL AND
    NULLIF(BTRIM("requested_by"), '') IS NOT NULL AND
    "version" > 0
  ),
  CONSTRAINT "DiscountAuthorityPolicy_floors_check" CHECK (
    "standard_margin_floor_percent" BETWEEN -100 AND 100 AND
    "finance_margin_floor_percent" BETWEEN -100 AND 100 AND
    "absolute_margin_floor_percent" BETWEEN -100 AND 100 AND
    "standard_margin_floor_percent" >= "finance_margin_floor_percent" AND
    "finance_margin_floor_percent" >= "absolute_margin_floor_percent"
  ),
  CONSTRAINT "DiscountAuthorityPolicy_status_check" CHECK (
    "status" IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUPERSEDED')
  ),
  CONSTRAINT "DiscountAuthorityPolicy_dates_check" CHECK (
    "effective_to" IS NULL OR "effective_to" >= "effective_from"
  ),
  CONSTRAINT "DiscountAuthorityPolicy_decision_check" CHECK (
    ("status" = 'PENDING_APPROVAL' AND "decided_by" IS NULL AND "decided_at" IS NULL) OR
    ("status" <> 'PENDING_APPROVAL' AND NULLIF(BTRIM("decided_by"), '') IS NOT NULL AND
      "decided_at" IS NOT NULL AND NULLIF(BTRIM("decision_reason"), '') IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "DiscountAuthorityPolicy_policy_key_version_key"
  ON "DiscountAuthorityPolicy"("policy_key", "version");
CREATE UNIQUE INDEX "DiscountAuthorityPolicy_supersedes_policy_id_key"
  ON "DiscountAuthorityPolicy"("supersedes_policy_id");
CREATE INDEX "DiscountAuthorityPolicy_service_class_region_currency_statu_idx"
  ON "DiscountAuthorityPolicy"("service_class", "region", "currency", "status", "effective_from");
CREATE INDEX "DiscountAuthorityPolicy_status_effective_from_idx"
  ON "DiscountAuthorityPolicy"("status", "effective_from");
ALTER TABLE "DiscountAuthorityPolicy"
  ADD CONSTRAINT "DiscountAuthorityPolicy_supersedes_policy_id_fkey"
  FOREIGN KEY ("supersedes_policy_id") REFERENCES "DiscountAuthorityPolicy"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "QuoteDiscountReview" (
  "id" TEXT NOT NULL,
  "quote_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "policy_ids" TEXT NOT NULL DEFAULT '[]',
  "gross_margin_by_service_class" TEXT NOT NULL DEFAULT '[]',
  "partner_pass_through" TEXT NOT NULL DEFAULT '{}',
  "commercial_reason" TEXT NOT NULL,
  "term_months" INTEGER NOT NULL,
  "ramp_schedule" TEXT NOT NULL DEFAULT '[]',
  "minimum_commit_amount" DECIMAL(14,4) NOT NULL,
  "catalog_minimum_commit_amount" DECIMAL(14,4) NOT NULL,
  "discount_expires_at" TIMESTAMP(3) NOT NULL,
  "required_approval_role" TEXT NOT NULL,
  "authority_rank" INTEGER NOT NULL,
  "financial_impact" DECIMAL(14,4) NOT NULL,
  "margin_impact" DECIMAL(8,4) NOT NULL,
  "technical_authority_hash" TEXT NOT NULL,
  "approval_id" TEXT,
  "requested_by" TEXT NOT NULL,
  "submitted_at" TIMESTAMP(3),
  "approved_by" TEXT,
  "approved_at" TIMESTAMP(3),
  "rejected_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuoteDiscountReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuoteDiscountReview_identity_check" CHECK (
    NULLIF(BTRIM("tenant_id"), '') IS NOT NULL AND
    NULLIF(BTRIM("environment_id"), '') IS NOT NULL AND
    NULLIF(BTRIM("commercial_reason"), '') IS NOT NULL AND
    NULLIF(BTRIM("requested_by"), '') IS NOT NULL AND
    "technical_authority_hash" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "QuoteDiscountReview_json_check" CHECK (
    jsonb_typeof("policy_ids"::jsonb) = 'array' AND jsonb_array_length("policy_ids"::jsonb) > 0 AND
    jsonb_typeof("gross_margin_by_service_class"::jsonb) = 'array' AND
      jsonb_array_length("gross_margin_by_service_class"::jsonb) > 0 AND
    jsonb_typeof("partner_pass_through"::jsonb) = 'object' AND
    jsonb_typeof("ramp_schedule"::jsonb) = 'array' AND jsonb_array_length("ramp_schedule"::jsonb) > 0
  ),
  CONSTRAINT "QuoteDiscountReview_values_check" CHECK (
    "term_months" > 0 AND "minimum_commit_amount" >= "catalog_minimum_commit_amount" AND
    "catalog_minimum_commit_amount" >= 0 AND "financial_impact" >= 0 AND "margin_impact" >= 0 AND
    "discount_expires_at" > "created_at"
  ),
  CONSTRAINT "QuoteDiscountReview_authority_check" CHECK (
    ("authority_rank" = 1 AND "required_approval_role" = 'COMMERCIAL_APPROVER') OR
    ("authority_rank" = 2 AND "required_approval_role" = 'FINANCE_COMMERCIAL_APPROVER') OR
    ("authority_rank" = 3 AND "required_approval_role" = 'EXECUTIVE_COMMERCIAL_APPROVER')
  ),
  CONSTRAINT "QuoteDiscountReview_status_check" CHECK (
    "status" IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED')
  ),
  CONSTRAINT "QuoteDiscountReview_approval_fields_check" CHECK (
    ("status" = 'DRAFT' AND "approval_id" IS NULL AND "submitted_at" IS NULL AND "approved_by" IS NULL) OR
    ("status" = 'PENDING_APPROVAL' AND "approval_id" IS NOT NULL AND "submitted_at" IS NOT NULL AND "approved_by" IS NULL) OR
    ("status" = 'APPROVED' AND "approval_id" IS NOT NULL AND "submitted_at" IS NOT NULL AND
      NULLIF(BTRIM("approved_by"), '') IS NOT NULL AND "approved_at" IS NOT NULL) OR
    ("status" = 'REJECTED' AND "approval_id" IS NOT NULL AND "submitted_at" IS NOT NULL AND
      NULLIF(BTRIM("rejected_reason"), '') IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "QuoteDiscountReview_quote_id_key" ON "QuoteDiscountReview"("quote_id");
CREATE UNIQUE INDEX "QuoteDiscountReview_approval_id_key" ON "QuoteDiscountReview"("approval_id");
CREATE INDEX "QuoteDiscountReview_tenant_id_environment_id_status_idx"
  ON "QuoteDiscountReview"("tenant_id", "environment_id", "status");
CREATE INDEX "QuoteDiscountReview_required_approval_role_status_idx"
  ON "QuoteDiscountReview"("required_approval_role", "status");
CREATE INDEX "QuoteDiscountReview_discount_expires_at_status_idx"
  ON "QuoteDiscountReview"("discount_expires_at", "status");

ALTER TABLE "QuoteDiscountReview"
  ADD CONSTRAINT "QuoteDiscountReview_quote_id_fkey"
  FOREIGN KEY ("quote_id") REFERENCES "CommercialQuote"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuoteDiscountReview"
  ADD CONSTRAINT "QuoteDiscountReview_approval_id_fkey"
  FOREIGN KEY ("approval_id") REFERENCES "CommercialApproval"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CommercialOrderLine"
  ADD COLUMN "list_unit_price" DECIMAL(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0;
UPDATE "CommercialOrderLine" SET "list_unit_price" = "unit_price";
ALTER TABLE "CommercialOrderLine"
  ADD CONSTRAINT "CommercialOrderLine_discount_economics_check" CHECK (
    "list_unit_price" >= 0 AND "discount_percent" BETWEEN 0 AND 100 AND "unit_price" >= 0 AND
    "unit_price" = ROUND("list_unit_price" * (1 - "discount_percent" / 100), 4)
  );

CREATE FUNCTION "enforce_discount_authority_policy_lifecycle"() RETURNS trigger AS $$
DECLARE
  prior "DiscountAuthorityPolicy"%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'PENDING_APPROVAL' THEN
      RAISE EXCEPTION 'discount authority policy must start PENDING_APPROVAL';
    END IF;
    IF NEW."supersedes_policy_id" IS NOT NULL THEN
      SELECT * INTO prior FROM "DiscountAuthorityPolicy" WHERE "id" = NEW."supersedes_policy_id";
      IF NOT FOUND OR prior."status" <> 'APPROVED' OR
         prior."policy_key" <> NEW."policy_key" OR prior."version" + 1 <> NEW."version" OR
         prior."service_class" <> NEW."service_class" OR prior."region" <> NEW."region" OR
         prior."currency" <> NEW."currency" THEN
        RAISE EXCEPTION 'discount policy revision must append to the exact approved predecessor';
      END IF;
    ELSIF NEW."version" <> 1 THEN
      RAISE EXCEPTION 'first discount authority policy version must be 1';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."policy_key" IS DISTINCT FROM OLD."policy_key" OR
     NEW."version" IS DISTINCT FROM OLD."version" OR
     NEW."supersedes_policy_id" IS DISTINCT FROM OLD."supersedes_policy_id" OR
     NEW."service_class" IS DISTINCT FROM OLD."service_class" OR
     NEW."region" IS DISTINCT FROM OLD."region" OR
     NEW."currency" IS DISTINCT FROM OLD."currency" OR
     NEW."standard_margin_floor_percent" IS DISTINCT FROM OLD."standard_margin_floor_percent" OR
     NEW."finance_margin_floor_percent" IS DISTINCT FROM OLD."finance_margin_floor_percent" OR
     NEW."absolute_margin_floor_percent" IS DISTINCT FROM OLD."absolute_margin_floor_percent" OR
     NEW."effective_from" IS DISTINCT FROM OLD."effective_from" OR
     NEW."requested_by" IS DISTINCT FROM OLD."requested_by" OR
     NEW."requested_at" IS DISTINCT FROM OLD."requested_at" OR
     NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'discount authority policy terms are immutable; create a revision';
  END IF;

  IF OLD."status" = 'PENDING_APPROVAL' AND NEW."status" IN ('APPROVED', 'REJECTED') THEN
    IF NEW."decided_by" IS NULL OR NEW."decided_by" = OLD."requested_by" OR
       NEW."decided_at" IS NULL OR NULLIF(BTRIM(NEW."decision_reason"), '') IS NULL THEN
      RAISE EXCEPTION 'discount policy decision requires a distinct named authority and reason';
    END IF;
  ELSIF OLD."status" = 'APPROVED' AND NEW."status" = 'SUPERSEDED' THEN
    PERFORM 1 FROM "DiscountAuthorityPolicy"
    WHERE "supersedes_policy_id" = OLD."id";
    IF NOT FOUND THEN
      RAISE EXCEPTION 'approved discount policy can only be superseded by its recorded revision';
    END IF;
  ELSIF NEW."status" IS DISTINCT FROM OLD."status" THEN
    RAISE EXCEPTION 'invalid discount authority policy transition from % to %', OLD."status", NEW."status";
  END IF;

  IF NEW."status" = 'APPROVED' AND EXISTS (
    SELECT 1 FROM "DiscountAuthorityPolicy" policy
    WHERE policy."id" <> NEW."id" AND policy."status" = 'APPROVED'
      AND policy."service_class" = NEW."service_class"
      AND policy."region" = NEW."region" AND policy."currency" = NEW."currency"
      AND policy."effective_from" <= COALESCE(NEW."effective_to", 'infinity'::timestamp)
      AND COALESCE(policy."effective_to", 'infinity'::timestamp) >= NEW."effective_from"
  ) THEN
    RAISE EXCEPTION 'overlapping approved discount authority policies are not allowed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DiscountAuthorityPolicy_lifecycle_guard"
  BEFORE INSERT OR UPDATE ON "DiscountAuthorityPolicy"
  FOR EACH ROW EXECUTE FUNCTION "enforce_discount_authority_policy_lifecycle"();

CREATE FUNCTION "reject_discount_authority_policy_delete"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'discount authority policies are retained versioned history';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "DiscountAuthorityPolicy_no_delete"
  BEFORE DELETE ON "DiscountAuthorityPolicy"
  FOR EACH ROW EXECUTE FUNCTION "reject_discount_authority_policy_delete"();

CREATE FUNCTION "enforce_quote_discount_review_lifecycle"() RETURNS trigger AS $$
DECLARE
  quote_record "CommercialQuote"%ROWTYPE;
  approval_record "CommercialApproval"%ROWTYPE;
  policy_id TEXT;
BEGIN
  SELECT * INTO quote_record FROM "CommercialQuote" WHERE "id" = NEW."quote_id";
  IF NOT FOUND OR quote_record."tenant_id" <> NEW."tenant_id" OR
     quote_record."environment_id" <> NEW."environment_id" OR
     quote_record."configuration_hash" <> NEW."technical_authority_hash" OR
     NOT quote_record."requires_approval" THEN
    RAISE EXCEPTION 'discount review must match a discounted quote and its exact technical authority';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF quote_record."status" <> 'DRAFT' OR NEW."status" <> 'DRAFT' OR
       quote_record."requested_by" <> NEW."requested_by" OR
       NEW."discount_expires_at" > quote_record."expires_at" THEN
      RAISE EXCEPTION 'discount review must start DRAFT for its exact unexpired quote';
    END IF;
    FOR policy_id IN SELECT jsonb_array_elements_text(NEW."policy_ids"::jsonb)
    LOOP
      PERFORM 1 FROM "DiscountAuthorityPolicy" policy
      WHERE policy."id" = policy_id AND policy."status" = 'APPROVED'
        AND policy."effective_from" <= NEW."created_at"
        AND (policy."effective_to" IS NULL OR policy."effective_to" >= NEW."created_at");
      IF NOT FOUND THEN
        RAISE EXCEPTION 'discount review references unavailable authority policy %', policy_id;
      END IF;
    END LOOP;
    RETURN NEW;
  END IF;

  IF NEW."quote_id" IS DISTINCT FROM OLD."quote_id" OR
     NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id" OR
     NEW."environment_id" IS DISTINCT FROM OLD."environment_id" OR
     NEW."policy_ids" IS DISTINCT FROM OLD."policy_ids" OR
     NEW."gross_margin_by_service_class" IS DISTINCT FROM OLD."gross_margin_by_service_class" OR
     NEW."partner_pass_through" IS DISTINCT FROM OLD."partner_pass_through" OR
     NEW."commercial_reason" IS DISTINCT FROM OLD."commercial_reason" OR
     NEW."term_months" IS DISTINCT FROM OLD."term_months" OR
     NEW."ramp_schedule" IS DISTINCT FROM OLD."ramp_schedule" OR
     NEW."minimum_commit_amount" IS DISTINCT FROM OLD."minimum_commit_amount" OR
     NEW."catalog_minimum_commit_amount" IS DISTINCT FROM OLD."catalog_minimum_commit_amount" OR
     NEW."discount_expires_at" IS DISTINCT FROM OLD."discount_expires_at" OR
     NEW."required_approval_role" IS DISTINCT FROM OLD."required_approval_role" OR
     NEW."authority_rank" IS DISTINCT FROM OLD."authority_rank" OR
     NEW."financial_impact" IS DISTINCT FROM OLD."financial_impact" OR
     NEW."margin_impact" IS DISTINCT FROM OLD."margin_impact" OR
     NEW."technical_authority_hash" IS DISTINCT FROM OLD."technical_authority_hash" OR
     NEW."requested_by" IS DISTINCT FROM OLD."requested_by" OR
     NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'discount economics and technical authority are frozen; create a quote revision';
  END IF;

  IF OLD."status" = 'DRAFT' AND NEW."status" = 'PENDING_APPROVAL' THEN
    SELECT * INTO approval_record FROM "CommercialApproval" WHERE "id" = NEW."approval_id";
    IF NOT FOUND OR approval_record."change_type" <> 'NON_STANDARD_DISCOUNT' OR
       approval_record."object_type" <> 'QuoteDiscountReview' OR
       approval_record."object_id" <> NEW."id" OR
       approval_record."tenant_id" <> NEW."tenant_id" OR
       approval_record."requested_by" <> NEW."requested_by" OR
       approval_record."required_approval_role" <> NEW."required_approval_role" OR
       approval_record."status" <> 'PENDING_APPROVAL' OR
       approval_record."expires_at" IS DISTINCT FROM NEW."discount_expires_at" THEN
      RAISE EXCEPTION 'discount review requires its exact pending authority approval';
    END IF;
  ELSIF OLD."status" = 'PENDING_APPROVAL' AND NEW."status" = 'APPROVED' THEN
    SELECT * INTO approval_record FROM "CommercialApproval" WHERE "id" = NEW."approval_id";
    IF NOT FOUND OR approval_record."status" <> 'APPROVED' OR
       approval_record."approved_by" <> NEW."approved_by" OR
       NEW."approved_by" = NEW."requested_by" OR
       NEW."approved_at" IS NULL OR NEW."discount_expires_at" <= CURRENT_TIMESTAMP THEN
      RAISE EXCEPTION 'discount review requires its current approved maker-checker authority record';
    END IF;
  ELSIF OLD."status" = 'PENDING_APPROVAL' AND NEW."status" = 'REJECTED' THEN
    SELECT * INTO approval_record FROM "CommercialApproval" WHERE "id" = NEW."approval_id";
    IF NOT FOUND OR approval_record."status" <> 'REJECTED' OR
       NULLIF(BTRIM(NEW."rejected_reason"), '') IS NULL THEN
      RAISE EXCEPTION 'discount rejection requires its rejected authority record and reason';
    END IF;
  ELSIF NEW."status" IS DISTINCT FROM OLD."status" THEN
    RAISE EXCEPTION 'invalid quote discount review transition from % to %', OLD."status", NEW."status";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "QuoteDiscountReview_lifecycle_guard"
  BEFORE INSERT OR UPDATE ON "QuoteDiscountReview"
  FOR EACH ROW EXECUTE FUNCTION "enforce_quote_discount_review_lifecycle"();

CREATE FUNCTION "reject_quote_discount_review_delete"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'quote discount reviews are retained approval evidence';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "QuoteDiscountReview_no_delete"
  BEFORE DELETE ON "QuoteDiscountReview"
  FOR EACH ROW EXECUTE FUNCTION "reject_quote_discount_review_delete"();

-- Even the generic approval endpoint cannot bypass the authority tier recorded
-- on the frozen review. The approver must hold an active tenant role at or
-- above the required rank.
CREATE FUNCTION "enforce_i3_discount_approval_authority"() RETURNS trigger AS $$
DECLARE
  review "QuoteDiscountReview"%ROWTYPE;
  actor_rank INTEGER;
BEGIN
  IF NEW."change_type" = 'NON_STANDARD_DISCOUNT' AND
     NEW."object_type" = 'QuoteDiscountReview' AND
     OLD."status" = 'PENDING_APPROVAL' AND NEW."status" = 'APPROVED' THEN
    SELECT * INTO review FROM "QuoteDiscountReview" WHERE "id" = NEW."object_id";
    IF NOT FOUND OR review."approval_id" <> NEW."id" OR
       review."required_approval_role" <> NEW."required_approval_role" THEN
      RAISE EXCEPTION 'discount approval is not bound to its frozen review authority';
    END IF;
    SELECT COALESCE(MAX(CASE role."code"
      WHEN 'COMMERCIAL_APPROVER' THEN 1
      WHEN 'FINANCE_COMMERCIAL_APPROVER' THEN 2
      WHEN 'EXECUTIVE_COMMERCIAL_APPROVER' THEN 3
      ELSE 0 END), 0) INTO actor_rank
    FROM "authorization"."tenant_memberships" membership
    JOIN "authorization"."user_roles" user_role ON user_role."membership_id" = membership."id"
    JOIN "authorization"."roles" role ON role."id" = user_role."role_id"
    WHERE membership."tenantId"::text = review."tenant_id"
      AND membership."principalId"::text = NEW."approved_by"
      AND membership."status" = 'ACTIVE';
    IF actor_rank < review."authority_rank" THEN
      RAISE EXCEPTION 'actor authority rank % is below required discount rank %', actor_rank, review."authority_rank";
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CommercialApproval_i3_discount_authority_guard"
  BEFORE UPDATE ON "CommercialApproval"
  FOR EACH ROW EXECUTE FUNCTION "enforce_i3_discount_approval_authority"();

-- Replace the I1 quote lifecycle with the stronger I3 gate. The separate I2
-- roadmap trigger remains in force alongside this trigger.
CREATE OR REPLACE FUNCTION "enforce_commercial_quote_lifecycle"() RETURNS trigger AS $$
DECLARE
  validation_ok BOOLEAN;
  approval_ok BOOLEAN;
  review_ok BOOLEAN;
BEGIN
  IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id" OR
     NEW."environment_id" IS DISTINCT FROM OLD."environment_id" OR
     NEW."commercial_account_id" IS DISTINCT FROM OLD."commercial_account_id" OR
     NEW."catalog_version_id" IS DISTINCT FROM OLD."catalog_version_id" OR
     NEW."quote_key" IS DISTINCT FROM OLD."quote_key" OR
     NEW."version" IS DISTINCT FROM OLD."version" OR
     NEW."supersedes_quote_id" IS DISTINCT FROM OLD."supersedes_quote_id" OR
     NEW."currency" IS DISTINCT FROM OLD."currency" OR NEW."region" IS DISTINCT FROM OLD."region" OR
     NEW."term_months" IS DISTINCT FROM OLD."term_months" OR
     NEW."requires_approval" IS DISTINCT FROM OLD."requires_approval" OR
     NEW."snapshot" IS DISTINCT FROM OLD."snapshot" OR
     NEW."configuration_hash" IS DISTINCT FROM OLD."configuration_hash" OR
     NEW."validation_status" IS DISTINCT FROM OLD."validation_status" OR
     NEW."requested_by" IS DISTINCT FROM OLD."requested_by" OR
     NEW."expires_at" IS DISTINCT FROM OLD."expires_at" THEN
    RAISE EXCEPTION 'versioned quote configuration is immutable; create a new quote revision';
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" IN ('PENDING_APPROVAL', 'CANCELLED', 'EXPIRED')) OR
    (OLD."status" = 'PENDING_APPROVAL' AND NEW."status" IN ('APPROVED', 'REJECTED', 'DRAFT', 'CANCELLED', 'EXPIRED')) OR
    (OLD."status" = 'APPROVED' AND NEW."status" IN ('CONVERTED', 'EXPIRED', 'CANCELLED'))
  ) THEN
    RAISE EXCEPTION 'invalid commercial quote transition from % to %', OLD."status", NEW."status";
  END IF;

  IF NEW."status" IN ('PENDING_APPROVAL', 'APPROVED', 'CONVERTED') THEN
    SELECT EXISTS (SELECT 1 FROM "CommercialQuoteValidation" validation
      WHERE validation."quote_id" = NEW."id" AND validation."tenant_id" = NEW."tenant_id"
        AND validation."environment_id" = NEW."environment_id"
        AND validation."configuration_hash" = NEW."configuration_hash" AND validation."result" = 'PASS')
      INTO validation_ok;
    IF NEW."validation_status" <> 'VALIDATED' OR NOT validation_ok THEN
      RAISE EXCEPTION 'quote transition requires its exact successful immutable validation receipt';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM "CommercialQuoteLine" WHERE "quote_id" = NEW."id" AND "line_discount_percent" > 0)
     AND NOT NEW."requires_approval" THEN
    RAISE EXCEPTION 'discounted quote must require commercial approval';
  END IF;

  IF NEW."requires_approval" AND NEW."status" IN ('PENDING_APPROVAL', 'APPROVED', 'CONVERTED') THEN
    SELECT EXISTS (
      SELECT 1 FROM "QuoteDiscountReview" review
      JOIN "CommercialApproval" approval ON approval."id" = review."approval_id"
      WHERE review."quote_id" = NEW."id" AND review."tenant_id" = NEW."tenant_id"
        AND review."environment_id" = NEW."environment_id"
        AND review."technical_authority_hash" = NEW."configuration_hash"
        AND review."approval_id" = NEW."approval_id"
        AND approval."object_type" = 'QuoteDiscountReview' AND approval."object_id" = review."id"
        AND approval."required_approval_role" = review."required_approval_role"
        AND (
          (NEW."status" = 'PENDING_APPROVAL' AND review."status" IN ('PENDING_APPROVAL', 'APPROVED')
            AND approval."status" IN ('PENDING_APPROVAL', 'APPROVED', 'APPLIED')) OR
          (NEW."status" IN ('APPROVED', 'CONVERTED') AND review."status" = 'APPROVED'
            AND approval."status" IN ('APPROVED', 'APPLIED')
            AND review."discount_expires_at" > CURRENT_TIMESTAMP)
        )
    ) INTO review_ok;
    IF NOT review_ok THEN
      RAISE EXCEPTION 'discounted quote requires its current frozen margin review and required authority';
    END IF;
  END IF;

  IF NEW."status" = 'APPROVED' THEN
    IF NEW."approved_by" IS NULL OR NEW."approved_by" = NEW."requested_by" THEN
      RAISE EXCEPTION 'quote approval requires a distinct named approver';
    END IF;
    IF NEW."expires_at" IS NOT NULL AND NEW."expires_at" <= CURRENT_TIMESTAMP THEN
      RAISE EXCEPTION 'expired quote cannot be approved';
    END IF;
    IF NEW."requires_approval" THEN
      SELECT EXISTS (SELECT 1 FROM "CommercialApproval"
        WHERE "id" = NEW."approval_id" AND "status" IN ('APPROVED', 'APPLIED')) INTO approval_ok;
      IF NOT approval_ok THEN
        RAISE EXCEPTION 'discounted quote requires its approved maker-checker record';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "enforce_commercial_quote_line_mutation"() RETURNS trigger AS $$
DECLARE
  parent_status TEXT;
  parent_requires_approval BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT "status", "requires_approval" INTO parent_status, parent_requires_approval
    FROM "CommercialQuote" WHERE "id" = OLD."quote_id";
  ELSE
    SELECT "status", "requires_approval" INTO parent_status, parent_requires_approval
    FROM "CommercialQuote" WHERE "id" = NEW."quote_id";
  END IF;
  IF parent_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'quote lines are immutable outside DRAFT; create a new quote revision';
  END IF;
  IF TG_OP <> 'DELETE' AND NEW."line_discount_percent" > 0 AND NOT parent_requires_approval THEN
    RAISE EXCEPTION 'discounted quote line requires governed approval at quote creation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
