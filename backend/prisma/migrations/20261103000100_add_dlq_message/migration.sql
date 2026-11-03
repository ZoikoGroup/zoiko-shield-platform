-- Persistent ingestion dead-letter queue.
--
-- Replaces the in-process Map in DlqReplayQuarantineService, which lost every
-- quarantined message on restart, and whose replay only flipped a status
-- field. The table lives in the ingest schema and carries a NOT NULL
-- tenant_id, so scripts/apply-database-access.js applies the standard tenant
-- isolation policy after this migration is deployed.

-- CreateTable
CREATE TABLE "ingest"."DlqMessage" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "source_kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "connector_id" TEXT,
    "environment_id" TEXT,
    "source_region" TEXT,
    "kafka_topic" TEXT,
    "kafka_partition" INTEGER,
    "kafka_offset" TEXT,
    "original_payload" TEXT NOT NULL,
    "payload_digest" TEXT NOT NULL,
    "error_code" TEXT NOT NULL,
    "error_reason" TEXT NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "status" TEXT NOT NULL,
    "last_error" TEXT,
    "quarantined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_attempt_at" TIMESTAMP(3),
    "replayed_at" TIMESTAMP(3),

    CONSTRAINT "DlqMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DlqMessage_message_id_key"
    ON "ingest"."DlqMessage"("message_id");

-- CreateIndex
CREATE INDEX "DlqMessage_tenant_id_status_idx"
    ON "ingest"."DlqMessage"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "DlqMessage_tenant_id_payload_digest_idx"
    ON "ingest"."DlqMessage"("tenant_id", "payload_digest");
