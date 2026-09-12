-- CreateTable
CREATE TABLE "ai_incidents" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "affected_model" TEXT,
    "affected_prompt_key" TEXT,
    "affected_tool" TEXT,
    "kill_switch_active" BOOLEAN NOT NULL DEFAULT false,
    "kill_switch_details" TEXT,
    "fallback_active" BOOLEAN NOT NULL DEFAULT false,
    "fallback_details" TEXT,
    "rca_summary" TEXT,
    "rca_details" TEXT,
    "decision_envelope_id" TEXT,
    "decision_envelope" TEXT,
    "resolution_summary" TEXT,
    "declared_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "timeline" TEXT NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_incidents_tenant_id_status_idx" ON "ai_incidents"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "ai_incidents_tenant_id_severity_idx" ON "ai_incidents"("tenant_id", "severity");
