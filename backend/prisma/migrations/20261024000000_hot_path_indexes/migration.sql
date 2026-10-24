-- Hot-path indexes. Creates run before drops so no query is ever left without
-- a usable index. Each dropped index is either a duplicate or a prefix of an
-- index created here (or of an existing unique constraint).

-- Outbox / commercial-event publishers poll every 10s for unpublished rows,
-- oldest first. Partial indexes hold only the backlog, not published history.
CREATE INDEX "OutboxEvent_unpublished_created_at_idx" ON "messaging"."OutboxEvent"("created_at") WHERE (published_at IS NULL);
CREATE INDEX "CommercialEvent_unpublished_created_at_idx" ON "commercial"."CommercialEvent"("created_at") WHERE (published_at IS NULL);

-- Tenant-scoped lookups that filter on a second column.
CREATE INDEX "RawEvent_tenant_id_received_at_idx" ON "ingest"."RawEvent"("tenant_id", "received_at");
CREATE INDEX "Alert_tenant_id_status_severity_idx" ON "alert"."Alert"("tenant_id", "status", "severity");
CREATE INDEX "Case_tenant_id_status_idx" ON "case_management"."Case"("tenant_id", "status");
CREATE INDEX "NotificationDelivery_tenant_id_recipient_principal_id_creat_idx" ON "notification"."NotificationDelivery"("tenant_id", "recipient_principal_id", "created_at");
CREATE INDEX "Entitlement_commercial_account_id_status_idx" ON "commercial"."Entitlement"("commercial_account_id", "status");

-- Scheduled sweeps (exception expiry every minute, evidence decay).
CREATE INDEX "Exception_status_expires_at_idx" ON "risk"."Exception"("status", "expires_at");
CREATE INDEX "EvidenceRecord_freshness_state_created_at_idx" ON "evidence"."EvidenceRecord"("freshness_state", "created_at");

-- Redundant: duplicates the unique index on idempotency_key.
DROP INDEX "commercial"."CommercialEvent_idempotency_key_idx";
-- Replaced by the partial unpublished index above (only the publishers read published_at).
DROP INDEX "messaging"."OutboxEvent_published_at_idx";
-- Redundant: tenant_id is the leading column of an index created above.
DROP INDEX "alert"."Alert_tenant_id_idx";
DROP INDEX "case_management"."Case_tenant_id_idx";
DROP INDEX "ingest"."RawEvent_tenant_id_idx";
DROP INDEX "notification"."NotificationDelivery_tenant_id_idx";
