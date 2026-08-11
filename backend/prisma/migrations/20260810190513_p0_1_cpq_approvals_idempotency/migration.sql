-- AlterTable
ALTER TABLE "CommercialAccount" ADD COLUMN     "business_unit_id" TEXT,
ADD COLUMN     "environment_id" TEXT,
ADD COLUMN     "group_account_id" TEXT,
ADD COLUMN     "legal_entity_id" TEXT,
ADD COLUMN     "region" TEXT NOT NULL DEFAULT 'GLOBAL',
ADD COLUMN     "residency_policy" TEXT;

-- CreateTable
CREATE TABLE "CommercialQuote" (
    "id" TEXT NOT NULL,
    "commercial_account_id" TEXT NOT NULL,
    "catalog_version_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "region" TEXT NOT NULL DEFAULT 'GLOBAL',
    "term_months" INTEGER NOT NULL DEFAULT 12,
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "approval_id" TEXT,
    "snapshot" TEXT NOT NULL DEFAULT '{}',
    "requested_by" TEXT NOT NULL,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejected_reason" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialQuoteLine" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "price_book_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(14,4) NOT NULL,
    "line_discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialQuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialOrder" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "commercial_account_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "contract_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialOrderLine" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(14,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialSubscription" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "commercial_account_id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "effective_from" TIMESTAMP(3),
    "effective_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialAmendment" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "amendment_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "effective_at" TIMESTAMP(3),
    "before_snapshot" TEXT NOT NULL DEFAULT '{}',
    "proposed_snapshot" TEXT NOT NULL DEFAULT '{}',
    "requested_by" TEXT NOT NULL,
    "approved_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialAmendment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialApproval" (
    "id" TEXT NOT NULL,
    "change_type" TEXT NOT NULL,
    "object_type" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "requested_by" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "before_snapshot" TEXT NOT NULL DEFAULT '{}',
    "proposed_snapshot" TEXT NOT NULL DEFAULT '{}',
    "financial_impact" DECIMAL(14,4),
    "margin_impact" DECIMAL(6,4),
    "required_approval_role" TEXT NOT NULL DEFAULT 'BILLING_ADMIN',
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "decision_reason" TEXT,
    "expires_at" TIMESTAMP(3),
    "applied_at" TIMESTAMP(3),
    "idempotency_key" TEXT,

    CONSTRAINT "CommercialApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "tenant_id" TEXT,
    "actor_id" TEXT,
    "request_fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "response_code" INTEGER,
    "response_body" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommercialQuote_commercial_account_id_idx" ON "CommercialQuote"("commercial_account_id");

-- CreateIndex
CREATE INDEX "CommercialQuote_status_idx" ON "CommercialQuote"("status");

-- CreateIndex
CREATE INDEX "CommercialQuoteLine_quote_id_idx" ON "CommercialQuoteLine"("quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialOrder_contract_id_key" ON "CommercialOrder"("contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialOrder_idempotency_key_key" ON "CommercialOrder"("idempotency_key");

-- CreateIndex
CREATE INDEX "CommercialOrder_commercial_account_id_idx" ON "CommercialOrder"("commercial_account_id");

-- CreateIndex
CREATE INDEX "CommercialOrder_status_idx" ON "CommercialOrder"("status");

-- CreateIndex
CREATE INDEX "CommercialOrderLine_order_id_idx" ON "CommercialOrderLine"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialSubscription_order_id_key" ON "CommercialSubscription"("order_id");

-- CreateIndex
CREATE INDEX "CommercialSubscription_commercial_account_id_idx" ON "CommercialSubscription"("commercial_account_id");

-- CreateIndex
CREATE INDEX "CommercialSubscription_status_idx" ON "CommercialSubscription"("status");

-- CreateIndex
CREATE INDEX "CommercialAmendment_subscription_id_idx" ON "CommercialAmendment"("subscription_id");

-- CreateIndex
CREATE INDEX "CommercialAmendment_status_idx" ON "CommercialAmendment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialApproval_idempotency_key_key" ON "CommercialApproval"("idempotency_key");

-- CreateIndex
CREATE INDEX "CommercialApproval_object_type_object_id_idx" ON "CommercialApproval"("object_type", "object_id");

-- CreateIndex
CREATE INDEX "CommercialApproval_status_idx" ON "CommercialApproval"("status");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_idempotency_key_operation_key" ON "IdempotencyRecord"("idempotency_key", "operation");

-- AddForeignKey
ALTER TABLE "CommercialQuote" ADD CONSTRAINT "CommercialQuote_commercial_account_id_fkey" FOREIGN KEY ("commercial_account_id") REFERENCES "CommercialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialQuote" ADD CONSTRAINT "CommercialQuote_catalog_version_id_fkey" FOREIGN KEY ("catalog_version_id") REFERENCES "CatalogVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialQuoteLine" ADD CONSTRAINT "CommercialQuoteLine_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "CommercialQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialOrder" ADD CONSTRAINT "CommercialOrder_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "CommercialQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialOrderLine" ADD CONSTRAINT "CommercialOrderLine_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "CommercialOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialAmendment" ADD CONSTRAINT "CommercialAmendment_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "CommercialSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

