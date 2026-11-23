-- G0 gap remediation: email access audit must be immutable and tamper-evident
-- (spec W11 "no edit affordance", QA-05, SEC audit-event integrity).
--
-- Expand step: the chain columns are nullable so rows written before this
-- migration stay valid. New rows are written by EmailSecurityService.appendAudit
-- inside a per-tenant advisory-locked transaction.

ALTER TABLE "email_security"."EmailAccessAuditEvent"
  ADD COLUMN "seq" INTEGER,
  ADD COLUMN "prev_hash" TEXT,
  ADD COLUMN "event_hash" TEXT;

CREATE UNIQUE INDEX "EmailAccessAuditEvent_tenant_id_seq_key"
  ON "email_security"."EmailAccessAuditEvent"("tenant_id", "seq");

-- UPDATE is never allowed. DELETE is allowed only inside the tenant-erasure
-- transaction (offboarding sets zoiko.tenant_erasure = 'on' with set_config(...,
-- true), i.e. transaction-local), because ZS-ENG-OFF-DEL-001 requires erasing
-- every tenant_id-keyed row. Any other delete is rejected.
CREATE FUNCTION "email_security"."reject_email_audit_mutation"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND COALESCE(current_setting('zoiko.tenant_erasure', true), '') = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'EmailAccessAuditEvent is append-only (% rejected)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "EmailAccessAuditEvent_no_update"
  BEFORE UPDATE ON "email_security"."EmailAccessAuditEvent"
  FOR EACH ROW EXECUTE FUNCTION "email_security"."reject_email_audit_mutation"();
CREATE TRIGGER "EmailAccessAuditEvent_no_delete"
  BEFORE DELETE ON "email_security"."EmailAccessAuditEvent"
  FOR EACH ROW EXECUTE FUNCTION "email_security"."reject_email_audit_mutation"();
CREATE TRIGGER "EmailAccessAuditEvent_no_truncate"
  BEFORE TRUNCATE ON "email_security"."EmailAccessAuditEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION "email_security"."reject_email_audit_mutation"();
