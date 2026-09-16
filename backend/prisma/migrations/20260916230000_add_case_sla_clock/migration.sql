-- CreateTable
CREATE TABLE "CaseSlaClock" (
    "case_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "coverage_tier" TEXT NOT NULL DEFAULT '24_7',
    "target_response_minutes" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paused_at" TIMESTAMP(3),
    "pause_reason" TEXT,
    "total_paused_ms" INTEGER NOT NULL DEFAULT 0,
    "stopped_at" TIMESTAMP(3),
    "active_triage_minutes" INTEGER,
    "breached_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseSlaClock_pkey" PRIMARY KEY ("case_id")
);

-- CreateIndex
CREATE INDEX "CaseSlaClock_tenant_id_idx" ON "CaseSlaClock"("tenant_id");

-- CreateIndex
CREATE INDEX "CaseSlaClock_status_idx" ON "CaseSlaClock"("status");

-- AddForeignKey
ALTER TABLE "CaseSlaClock" ADD CONSTRAINT "CaseSlaClock_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
