-- ZS-UX-EMTI-001 / ZS-ZM-ENG-003 gap remediation (expand-only; all new columns nullable or defaulted).

-- Connector lifecycle (18.1), consent expiry (T05), vault-held credentials (WF-03, SEC-02),
-- provider pull cursor (T06) and Zoiko Mail tenant binding (EW06).
ALTER TABLE "email_security"."EmailSourceConnection"
  ADD COLUMN "status_reason" TEXT,
  ADD COLUMN "consent_expires_at" TIMESTAMP(3),
  ADD COLUMN "credential_ref" TEXT,
  ADD COLUMN "last_tested_at" TIMESTAMP(3),
  ADD COLUMN "last_test_status" TEXT,
  ADD COLUMN "last_test_report" JSONB,
  ADD COLUMN "sync_cursor" TEXT,
  ADD COLUMN "mail_binding_id" TEXT;
CREATE UNIQUE INDEX "EmailSourceConnection_mail_binding_id_key"
  ON "email_security"."EmailSourceConnection"("mail_binding_id");

-- Server-side PKCE verifier (never sent to the browser).
ALTER TABLE "email_security"."EmailConnectionIntent"
  ADD COLUMN "pkce_verifier_ref" TEXT,
  ADD COLUMN "failure_reason" TEXT;

-- Optimistic concurrency for analyst decisions (E07).
ALTER TABLE "email_security"."EmailThreatFinding"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "email_security"."EmailDetectionDecision"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- Scoped, revocable auditor grants (WF-09, T09).
ALTER TABLE "email_security"."EmailEvidenceManifest"
  ADD COLUMN "auditor_grant_revoked_at" TIMESTAMP(3);

-- Vault-encrypted provider secrets. tenant_id NOT NULL => tenant RLS is applied
-- automatically by scripts/apply-database-access.js.
CREATE TABLE "email_security"."EmailCredentialSecret" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "connection_id" TEXT,
    "intent_id" TEXT,
    "provider" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "ciphertext" TEXT,
    "iv" TEXT,
    "auth_tag" TEXT,
    "wrapped_key" TEXT,
    "key_ref" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailCredentialSecret_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmailCredentialSecret_tenant_id_connection_id_purpose_idx"
  ON "email_security"."EmailCredentialSecret"("tenant_id", "connection_id", "purpose");
