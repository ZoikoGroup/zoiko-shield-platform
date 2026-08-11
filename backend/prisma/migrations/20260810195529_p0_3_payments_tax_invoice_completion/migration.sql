-- AlterTable
ALTER TABLE "CommercialInvoice" ADD COLUMN     "fx_effective_at" TIMESTAMP(3),
ADD COLUMN     "fx_rate" DECIMAL(18,8),
ADD COLUMN     "fx_source" TEXT,
ADD COLUMN     "tax_result" TEXT NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "CommercialInvoiceLine" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "subscription_id" TEXT,
    "service_period_start" TIMESTAMP(3) NOT NULL,
    "service_period_end" TIMESTAMP(3) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(14,4) NOT NULL,
    "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "tax_rule_id" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "source_version" TEXT NOT NULL DEFAULT 'v1',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialCreditNote" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount" DECIMAL(14,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "issued_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialCreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialDebitNote" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount" DECIMAL(14,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "issued_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialDebitNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRule" (
    "id" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "product_tax_class" TEXT NOT NULL,
    "rate_percent" DECIMAL(6,4) NOT NULL,
    "reverse_charge" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMP(3),
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethodReference" (
    "id" TEXT NOT NULL,
    "commercial_account_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_token" TEXT NOT NULL,
    "brand" TEXT,
    "last4" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentMethodReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "commercial_account_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_payment_id" TEXT,
    "payment_method_reference_id" TEXT,
    "amount" DECIMAL(14,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "amount" DECIMAL(14,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommercialInvoiceLine_invoice_id_idx" ON "CommercialInvoiceLine"("invoice_id");

-- CreateIndex
CREATE INDEX "CommercialCreditNote_invoice_id_idx" ON "CommercialCreditNote"("invoice_id");

-- CreateIndex
CREATE INDEX "CommercialDebitNote_invoice_id_idx" ON "CommercialDebitNote"("invoice_id");

-- CreateIndex
CREATE INDEX "TaxRule_jurisdiction_product_tax_class_idx" ON "TaxRule"("jurisdiction", "product_tax_class");

-- CreateIndex
CREATE INDEX "TaxRule_status_idx" ON "TaxRule"("status");

-- CreateIndex
CREATE INDEX "PaymentMethodReference_commercial_account_id_idx" ON "PaymentMethodReference"("commercial_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotency_key_key" ON "Payment"("idempotency_key");

-- CreateIndex
CREATE INDEX "Payment_commercial_account_id_idx" ON "Payment"("commercial_account_id");

-- CreateIndex
CREATE INDEX "Payment_invoice_id_idx" ON "Payment"("invoice_id");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Refund_payment_id_idx" ON "Refund"("payment_id");

-- AddForeignKey
ALTER TABLE "CommercialInvoiceLine" ADD CONSTRAINT "CommercialInvoiceLine_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "CommercialInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialCreditNote" ADD CONSTRAINT "CommercialCreditNote_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "CommercialInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialDebitNote" ADD CONSTRAINT "CommercialDebitNote_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "CommercialInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "CommercialInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

