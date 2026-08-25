-- Category F: governed assurance content, contract-bound Continuous Assurance,
-- completeness-aware audit claims and prospective retention transitions.
-- This migration is intentionally generated but not auto-applied.

-- F1: framework and sector content must carry source rights, interpretation,
-- mapping-test evidence, bounded wording and independent release approval.
ALTER TABLE "FrameworkVersion"
  ADD COLUMN "source_reference" TEXT,
  ADD COLUMN "source_version" TEXT,
  ADD COLUMN "content_license_status" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "license_reference" TEXT,
  ADD COLUMN "display_rights" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "legal_interpretation_ref" TEXT,
  ADD COLUMN "sme_review_ref" TEXT,
  ADD COLUMN "mapping_test_status" TEXT NOT NULL DEFAULT 'NOT_RUN',
  ADD COLUMN "mapping_test_report_ref" TEXT,
  ADD COLUMN "approved_claim_wording" TEXT,
  ADD COLUMN "release_status" TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "approval_id" TEXT,
  ADD COLUMN "requested_by" TEXT,
  ADD COLUMN "approved_by" TEXT,
  ADD COLUMN "approved_at" TIMESTAMP(3);

-- A legacy PUBLISHED row cannot prove the newly mandatory release evidence.
UPDATE "FrameworkVersion"
SET "status" = 'DRAFT', "release_status" = 'MIGRATION_REVIEW'
WHERE "status" = 'PUBLISHED';

CREATE UNIQUE INDEX "FrameworkVersion_approval_id_key"
  ON "FrameworkVersion"("approval_id");
CREATE INDEX "FrameworkVersion_release_status_idx"
  ON "FrameworkVersion"("release_status");

ALTER TABLE "SectorPack"
  ADD COLUMN "source_reference" TEXT,
  ADD COLUMN "source_version" TEXT,
  ADD COLUMN "license_reference" TEXT,
  ADD COLUMN "legal_interpretation_ref" TEXT,
  ADD COLUMN "sme_review_ref" TEXT,
  ADD COLUMN "mapping_test_status" TEXT NOT NULL DEFAULT 'NOT_RUN',
  ADD COLUMN "mapping_test_report_ref" TEXT,
  ADD COLUMN "approval_id" TEXT,
  ADD COLUMN "requested_by" TEXT;

-- Existing APPROVED packs lack the legal/SME/mapping release record.
UPDATE "SectorPack"
SET "release_status" = 'MIGRATION_REVIEW'
WHERE "release_status" = 'APPROVED';

CREATE UNIQUE INDEX "SectorPack_approval_id_key"
  ON "SectorPack"("approval_id");

CREATE FUNCTION "enforce_framework_version_release"() RETURNS trigger AS $$
BEGIN
  IF NEW."release_status" = 'APPROVED' OR NEW."status" = 'PUBLISHED' THEN
    IF NEW."release_status" <> 'APPROVED' OR NEW."status" <> 'PUBLISHED' OR
       NEW."content_license_status" <> 'LICENSED' OR NOT NEW."display_rights" OR
       NEW."mapping_test_status" <> 'PASSED' OR NEW."approval_id" IS NULL OR
       NULLIF(BTRIM(NEW."source_reference"), '') IS NULL OR
       NULLIF(BTRIM(NEW."source_version"), '') IS NULL OR
       NULLIF(BTRIM(NEW."license_reference"), '') IS NULL OR
       NULLIF(BTRIM(NEW."legal_interpretation_ref"), '') IS NULL OR
       NULLIF(BTRIM(NEW."sme_review_ref"), '') IS NULL OR
       NULLIF(BTRIM(NEW."mapping_test_report_ref"), '') IS NULL OR
       NULLIF(BTRIM(NEW."approved_claim_wording"), '') IS NULL OR
       NULLIF(BTRIM(NEW."approved_by"), '') IS NULL OR NEW."approved_at" IS NULL THEN
      RAISE EXCEPTION 'published framework version requires complete approved release evidence';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "FrameworkVersion_release_evidence"
  BEFORE INSERT OR UPDATE ON "FrameworkVersion"
  FOR EACH ROW EXECUTE FUNCTION "enforce_framework_version_release"();

CREATE FUNCTION "enforce_sector_pack_release"() RETURNS trigger AS $$
BEGIN
  IF NEW."release_status" = 'APPROVED' THEN
    IF NEW."content_license_status" <> 'LICENSED' OR NOT NEW."display_rights" OR
       NEW."mapping_test_status" <> 'PASSED' OR NEW."approval_id" IS NULL OR
       NULLIF(BTRIM(NEW."source_reference"), '') IS NULL OR
       NULLIF(BTRIM(NEW."source_version"), '') IS NULL OR
       NULLIF(BTRIM(NEW."license_reference"), '') IS NULL OR
       NULLIF(BTRIM(NEW."legal_interpretation_ref"), '') IS NULL OR
       NULLIF(BTRIM(NEW."sme_review_ref"), '') IS NULL OR
       NULLIF(BTRIM(NEW."mapping_test_report_ref"), '') IS NULL OR
       NULLIF(BTRIM(NEW."approved_claim_wording"), '') IS NULL OR
       NULLIF(BTRIM(NEW."approved_by"), '') IS NULL OR NEW."approved_at" IS NULL THEN
      RAISE EXCEPTION 'approved sector pack requires complete approved release evidence';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "SectorPack_release_evidence"
  BEFORE INSERT OR UPDATE ON "SectorPack"
  FOR EACH ROW EXECUTE FUNCTION "enforce_sector_pack_release"();

-- Category F commercial boundary. Pricing is intentionally restricted to
-- committed scope/tier dimensions and excludes failures, findings and outcomes.
CREATE TABLE "ContinuousAssuranceProfile" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "commercial_account_id" TEXT NOT NULL,
  "contract_id" TEXT NOT NULL,
  "profile_key" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "service_tier" TEXT NOT NULL,
  "recurring_pricing_metric" TEXT NOT NULL,
  "price_book_id" TEXT NOT NULL,
  "legal_entity_ids" TEXT NOT NULL DEFAULT '[]',
  "business_unit_ids" TEXT NOT NULL DEFAULT '[]',
  "framework_version_ids" TEXT NOT NULL DEFAULT '[]',
  "sector_pack_ids" TEXT NOT NULL DEFAULT '[]',
  "connector_ids" TEXT NOT NULL DEFAULT '[]',
  "control_scope" TEXT NOT NULL DEFAULT '{}',
  "evidence_retention_policy" TEXT NOT NULL DEFAULT '{}',
  "auditor_seats" INTEGER NOT NULL DEFAULT 0,
  "workspace_count" INTEGER NOT NULL DEFAULT 0,
  "region" TEXT NOT NULL,
  "deployment_class" TEXT NOT NULL,
  "human_obligations" TEXT NOT NULL DEFAULT '{}',
  "no_guarantee_wording" TEXT NOT NULL,
  "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effective_to" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  "approval_id" TEXT,
  "requested_by" TEXT NOT NULL,
  "approved_by" TEXT,
  "approved_at" TIMESTAMP(3),
  "activated_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContinuousAssuranceProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContinuousAssuranceProfile_quantities_check" CHECK (
    "auditor_seats" >= 0 AND "workspace_count" >= 0
  ),
  CONSTRAINT "ContinuousAssuranceProfile_effective_window_check" CHECK (
    "effective_to" IS NULL OR "effective_to" > "effective_from"
  ),
  CONSTRAINT "ContinuousAssuranceProfile_pricing_metric_check" CHECK (
    "recurring_pricing_metric" IN (
      'LEGAL_ENTITY_FRAMEWORK_TIER',
      'COMMITTED_ASSURANCE_SCOPE',
      'AUDITOR_WORKSPACE_TIER'
    )
  ),
  CONSTRAINT "ContinuousAssuranceProfile_scope_check" CHECK (
    "framework_version_ids" <> '[]' AND "control_scope" <> '{}' AND
    "evidence_retention_policy" <> '{}' AND "human_obligations" <> '{}' AND
    ("legal_entity_ids" <> '[]' OR "business_unit_ids" <> '[]')
  ),
  CONSTRAINT "ContinuousAssuranceProfile_no_guarantee_check" CHECK (
    NULLIF(BTRIM("no_guarantee_wording"), '') IS NOT NULL
  ),
  CONSTRAINT "ContinuousAssuranceProfile_status_check" CHECK (
    "status" IN ('PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'SUSPENDED', 'ENDED')
  ),
  CONSTRAINT "ContinuousAssuranceProfile_activation_check" CHECK (
    "status" <> 'ACTIVE' OR (
      "approval_id" IS NOT NULL AND NULLIF(BTRIM("approved_by"), '') IS NOT NULL AND
      "approved_at" IS NOT NULL AND "activated_at" IS NOT NULL
    )
  )
);
CREATE UNIQUE INDEX "ContinuousAssuranceProfile_approval_id_key"
  ON "ContinuousAssuranceProfile"("approval_id");
CREATE UNIQUE INDEX "ContinuousAssuranceProfile_tenant_id_environment_id_profile_key_version_key"
  ON "ContinuousAssuranceProfile"("tenant_id", "environment_id", "profile_key", "version");
CREATE INDEX "ContinuousAssuranceProfile_tenant_id_environment_id_status_idx"
  ON "ContinuousAssuranceProfile"("tenant_id", "environment_id", "status");
CREATE INDEX "ContinuousAssuranceProfile_commercial_account_id_status_idx"
  ON "ContinuousAssuranceProfile"("commercial_account_id", "status");
CREATE INDEX "ContinuousAssuranceProfile_contract_id_status_idx"
  ON "ContinuousAssuranceProfile"("contract_id", "status");
CREATE INDEX "ContinuousAssuranceProfile_effective_from_effective_to_stat_idx"
  ON "ContinuousAssuranceProfile"("effective_from", "effective_to", "status");

ALTER TABLE "ContinuousAssuranceProfile"
  ADD CONSTRAINT "ContinuousAssuranceProfile_commercial_account_id_fkey"
  FOREIGN KEY ("commercial_account_id") REFERENCES "CommercialAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContinuousAssuranceProfile"
  ADD CONSTRAINT "ContinuousAssuranceProfile_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "Contract"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- F2: audit packages persist completeness, freshness, limitations, verifier
-- compatibility, frozen identity and claim decision/history.
ALTER TABLE "AuditPackage"
  ADD COLUMN "continuous_assurance_profile_id" TEXT,
  ADD COLUMN "completeness_state" TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "missing_evidence" TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN "freshness_state" TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "limitations" TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN "verifier_compatibility" TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "claim_eligibility" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "claim_eligibility_reason" TEXT NOT NULL DEFAULT 'PACKAGE_NOT_VALIDATED',
  ADD COLUMN "approved_claim_wording" TEXT,
  ADD COLUMN "claim_assessed_at" TIMESTAMP(3),
  ADD COLUMN "frozen_manifest_hash" TEXT,
  ADD COLUMN "retention_profile" TEXT,
  ADD COLUMN "retention_until" TIMESTAMP(3),
  ADD COLUMN "audit_cycle_reference" TEXT;

CREATE INDEX "AuditPackage_continuous_assurance_profile_id_status_idx"
  ON "AuditPackage"("continuous_assurance_profile_id", "status");
CREATE INDEX "AuditPackage_tenant_id_claim_eligibility_status_idx"
  ON "AuditPackage"("tenant_id", "claim_eligibility", "status");
ALTER TABLE "AuditPackage"
  ADD CONSTRAINT "AuditPackage_continuous_assurance_profile_id_fkey"
  FOREIGN KEY ("continuous_assurance_profile_id") REFERENCES "ContinuousAssuranceProfile"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AuditPackageClaimAssessment" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "package_id" TEXT NOT NULL,
  "package_version" INTEGER NOT NULL,
  "manifest_hash" TEXT,
  "completeness_state" TEXT NOT NULL,
  "missing_evidence" TEXT NOT NULL DEFAULT '[]',
  "freshness_state" TEXT NOT NULL,
  "integrity_state" TEXT NOT NULL,
  "verifier_compatibility" TEXT NOT NULL,
  "limitations" TEXT NOT NULL DEFAULT '[]',
  "claim_eligibility" BOOLEAN NOT NULL DEFAULT false,
  "eligibility_reason" TEXT NOT NULL,
  "approved_wording" TEXT,
  "assessed_by" TEXT NOT NULL,
  "assessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditPackageClaimAssessment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditPackageClaimAssessment_eligible_check" CHECK (
    NOT "claim_eligibility" OR (
      "completeness_state" = 'COMPLETE' AND "missing_evidence" = '[]' AND
      "freshness_state" = 'CURRENT' AND "integrity_state" = 'VERIFIED' AND
      "verifier_compatibility" = 'COMPATIBLE' AND
      NULLIF(BTRIM("manifest_hash"), '') IS NOT NULL AND
      NULLIF(BTRIM("approved_wording"), '') IS NOT NULL
    )
  )
);
CREATE INDEX "AuditPackageClaimAssessment_tenant_id_package_id_assessed_a_idx"
  ON "AuditPackageClaimAssessment"("tenant_id", "package_id", "assessed_at");
CREATE INDEX "AuditPackageClaimAssessment_claim_eligibility_assessed_at_idx"
  ON "AuditPackageClaimAssessment"("claim_eligibility", "assessed_at");
ALTER TABLE "AuditPackageClaimAssessment"
  ADD CONSTRAINT "AuditPackageClaimAssessment_package_id_fkey"
  FOREIGN KEY ("package_id") REFERENCES "AuditPackage"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "reject_audit_claim_assessment_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditPackageClaimAssessment is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "AuditPackageClaimAssessment_no_update"
  BEFORE UPDATE ON "AuditPackageClaimAssessment"
  FOR EACH ROW EXECUTE FUNCTION "reject_audit_claim_assessment_mutation"();
CREATE TRIGGER "AuditPackageClaimAssessment_no_delete"
  BEFORE DELETE ON "AuditPackageClaimAssessment"
  FOR EACH ROW EXECUTE FUNCTION "reject_audit_claim_assessment_mutation"();

CREATE FUNCTION "enforce_audit_package_claim_eligibility"() RETURNS trigger AS $$
BEGIN
  IF NEW."claim_eligibility" THEN
    IF NEW."status" <> 'FROZEN' OR NEW."completeness_state" <> 'COMPLETE' OR
       NEW."missing_evidence" <> '[]' OR NEW."freshness_state" <> 'CURRENT' OR
       NEW."verifier_compatibility" <> 'COMPATIBLE' OR
       NULLIF(BTRIM(NEW."approved_claim_wording"), '') IS NULL OR
       NULLIF(BTRIM(NEW."frozen_manifest_hash"), '') IS NULL OR
       NEW."claim_assessed_at" IS NULL THEN
      RAISE EXCEPTION 'audit claim eligibility requires a complete current frozen package';
    END IF;
    PERFORM 1
    FROM "AuditPackageClaimAssessment" assessment
    WHERE assessment."package_id" = NEW."id"
      AND assessment."package_version" = NEW."version"
      AND assessment."claim_eligibility"
      AND assessment."integrity_state" = 'VERIFIED'
      AND assessment."manifest_hash" = NEW."frozen_manifest_hash";
    IF NOT FOUND THEN
      RAISE EXCEPTION 'audit claim eligibility requires a matching append-only integrity assessment';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "AuditPackage_claim_eligibility_guard"
  BEFORE INSERT OR UPDATE ON "AuditPackage"
  FOR EACH ROW EXECUTE FUNCTION "enforce_audit_package_claim_eligibility"();

-- F3: a downgrade changes only the future assignment. Historical evidence,
-- legal holds and active audit-cycle retention are snapshotted and preserved.
CREATE TABLE "EvidenceRetentionTransition" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "amendment_id" TEXT NOT NULL,
  "target_retention_profile" TEXT NOT NULL,
  "effective_at" TIMESTAMP(3) NOT NULL,
  "historical_cutoff" TIMESTAMP(3) NOT NULL,
  "historical_evidence_count" INTEGER NOT NULL DEFAULT 0,
  "preserved_retention_profiles" TEXT NOT NULL DEFAULT '[]',
  "legal_hold_ids" TEXT NOT NULL DEFAULT '[]',
  "audit_package_ids" TEXT NOT NULL DEFAULT '[]',
  "preservation_basis" TEXT NOT NULL DEFAULT '{}',
  "preserve_historical_evidence" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
  "evidence_refs" TEXT NOT NULL DEFAULT '[]',
  "verified_by" TEXT,
  "verified_at" TIMESTAMP(3),
  "applied_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EvidenceRetentionTransition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EvidenceRetentionTransition_historical_preservation_check" CHECK (
    "preserve_historical_evidence" AND "historical_evidence_count" >= 0 AND
    "historical_cutoff" = "effective_at" AND
    NULLIF(BTRIM("target_retention_profile"), '') IS NOT NULL
  ),
  CONSTRAINT "EvidenceRetentionTransition_status_check" CHECK (
    "status" IN ('PENDING_VERIFICATION', 'VERIFIED', 'APPLIED')
  ),
  CONSTRAINT "EvidenceRetentionTransition_verification_check" CHECK (
    "status" = 'PENDING_VERIFICATION' OR (
      NULLIF(BTRIM("verified_by"), '') IS NOT NULL AND "verified_at" IS NOT NULL
    )
  ),
  CONSTRAINT "EvidenceRetentionTransition_applied_check" CHECK (
    "status" <> 'APPLIED' OR "applied_at" IS NOT NULL
  )
);
CREATE UNIQUE INDEX "EvidenceRetentionTransition_amendment_id_key"
  ON "EvidenceRetentionTransition"("amendment_id");
CREATE INDEX "EvidenceRetentionTransition_tenant_id_environment_id_status_idx"
  ON "EvidenceRetentionTransition"("tenant_id", "environment_id", "status");
CREATE INDEX "EvidenceRetentionTransition_effective_at_status_idx"
  ON "EvidenceRetentionTransition"("effective_at", "status");
ALTER TABLE "EvidenceRetentionTransition"
  ADD CONSTRAINT "EvidenceRetentionTransition_amendment_id_fkey"
  FOREIGN KEY ("amendment_id") REFERENCES "CommercialAmendment"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
