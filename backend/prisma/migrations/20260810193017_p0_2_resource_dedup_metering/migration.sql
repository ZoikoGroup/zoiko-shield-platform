-- AlterTable
ALTER TABLE "ProtectedResourceDefinition" ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "approved_by" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT';

-- CreateTable
CREATE TABLE "MeterDefinition" (
    "id" TEXT NOT NULL,
    "meter_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'EVENTS',
    "source_scope" TEXT NOT NULL DEFAULT '[]',
    "aggregation_window" TEXT NOT NULL DEFAULT 'DAILY',
    "dedupe_policy" TEXT NOT NULL DEFAULT 'SOURCE_EVENT_ID',
    "included_quantity" INTEGER NOT NULL DEFAULT 0,
    "billable_policy" TEXT NOT NULL DEFAULT 'STANDARD',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMP(3),
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeterDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeterEvent" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "meter_definition_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "source_event_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'EVENTS',
    "accepted_state" TEXT NOT NULL DEFAULT 'RECEIVED',
    "billable_state" TEXT NOT NULL DEFAULT 'NON_BILLABLE',
    "dedupe_key" TEXT NOT NULL,
    "is_platform_generated" BOOLEAN NOT NULL DEFAULT false,
    "correction_of_event_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeterEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeterDefinition_status_idx" ON "MeterDefinition"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MeterDefinition_meter_key_version_key" ON "MeterDefinition"("meter_key", "version");

-- CreateIndex
CREATE INDEX "MeterEvent_tenant_id_meter_definition_id_dedupe_key_idx" ON "MeterEvent"("tenant_id", "meter_definition_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "MeterEvent_tenant_id_idx" ON "MeterEvent"("tenant_id");

-- CreateIndex
CREATE INDEX "MeterEvent_accepted_state_idx" ON "MeterEvent"("accepted_state");

-- CreateIndex
CREATE INDEX "ProtectedResourceDefinition_status_idx" ON "ProtectedResourceDefinition"("status");

-- AddForeignKey
ALTER TABLE "MeterEvent" ADD CONSTRAINT "MeterEvent_meter_definition_id_fkey" FOREIGN KEY ("meter_definition_id") REFERENCES "MeterDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

