-- CreateTable
CREATE TABLE "ai_review_envelopes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "envelope_json" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_review_envelopes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_review_envelopes_tenant_id_idx" ON "ai_review_envelopes"("tenant_id");
