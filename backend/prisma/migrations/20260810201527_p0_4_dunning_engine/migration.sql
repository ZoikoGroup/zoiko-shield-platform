-- CreateTable
CREATE TABLE "DunningPolicy" (
    "id" TEXT NOT NULL,
    "policy_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "grace_period_days" INTEGER NOT NULL DEFAULT 7,
    "restrict_after_days" INTEGER NOT NULL DEFAULT 14,
    "suspend_after_days" INTEGER NOT NULL DEFAULT 30,
    "terminate_after_days" INTEGER NOT NULL DEFAULT 60,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DunningPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DunningCase" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "dunning_policy_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "triggered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_action_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DunningCase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DunningPolicy_status_idx" ON "DunningPolicy"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DunningPolicy_policy_key_version_key" ON "DunningPolicy"("policy_key", "version");

-- CreateIndex
CREATE INDEX "DunningCase_contract_id_idx" ON "DunningCase"("contract_id");

-- CreateIndex
CREATE INDEX "DunningCase_status_idx" ON "DunningCase"("status");

