-- Per-connector inbound webhook signing secrets (expand-only: one new table).
-- Secrets are envelope-encrypted; see the model comment in schemas/ingest.prisma.

CREATE TABLE "ingest"."ConnectorWebhookSecret" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "auth_tag" TEXT NOT NULL,
    "wrapped_key" TEXT NOT NULL,
    "key_ref" TEXT NOT NULL,
    "secret_hint" TEXT NOT NULL,
    "revealedAt" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" TIMESTAMP(3),

    CONSTRAINT "ConnectorWebhookSecret_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConnectorWebhookSecret_instanceId_version_key"
  ON "ingest"."ConnectorWebhookSecret"("instanceId", "version");
CREATE INDEX "ConnectorWebhookSecret_tenant_id_idx"
  ON "ingest"."ConnectorWebhookSecret"("tenant_id");
CREATE INDEX "ConnectorWebhookSecret_instanceId_status_idx"
  ON "ingest"."ConnectorWebhookSecret"("instanceId", "status");

ALTER TABLE "ingest"."ConnectorWebhookSecret"
  ADD CONSTRAINT "ConnectorWebhookSecret_instanceId_fkey"
  FOREIGN KEY ("instanceId") REFERENCES "ingest"."ConnectorInstance"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
