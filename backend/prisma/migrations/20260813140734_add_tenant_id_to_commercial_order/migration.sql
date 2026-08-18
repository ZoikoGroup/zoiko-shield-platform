-- AlterTable
ALTER TABLE "CommercialOrder" ADD COLUMN "tenant_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CommercialOrder_tenant_id_key" ON "CommercialOrder"("tenant_id");
