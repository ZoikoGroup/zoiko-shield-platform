-- CreateTable
CREATE TABLE "CaseQualityReview" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "review_type" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "requested_by" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewer_id" TEXT,
    "comments" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseQualityReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaseQualityReview_tenant_id_idx" ON "CaseQualityReview"("tenant_id");

-- CreateIndex
CREATE INDEX "CaseQualityReview_case_id_idx" ON "CaseQualityReview"("case_id");

-- CreateIndex
CREATE INDEX "CaseQualityReview_status_idx" ON "CaseQualityReview"("status");

-- AddForeignKey
ALTER TABLE "CaseQualityReview" ADD CONSTRAINT "CaseQualityReview_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
