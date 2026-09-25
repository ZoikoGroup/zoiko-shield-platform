-- Tenant-owned child rows carry their tenant (ZoikoShield combined spec §11.1,
-- §15: tenant-inclusive keys on pooled authoritative tables).
--
-- Each child gets tenant_id, backfilled from its parent, and a composite
-- foreign key (tenant_id, parent_id) -> parent(tenant_id, id). The database,
-- not the application, then guarantees a child can never name a different
-- tenant from its parent, and offboarding's tenant_id discovery finds them.
--
-- Data statements run in platform scope so they are unaffected by tenant
-- row-level security on databases where it is already applied.
SELECT set_config('app.platform_scope', 'on', false);

-- Tenant-inclusive uniqueness on the parents, required by the composite keys.
CREATE UNIQUE INDEX "AuditPackage_tenant_id_id_key" ON "audit_package"."AuditPackage"("tenant_id", "id");
CREATE UNIQUE INDEX "CommercialQuote_tenant_id_id_key" ON "cpq"."CommercialQuote"("tenant_id", "id");
CREATE UNIQUE INDEX "ResourceObservation_tenant_id_id_key" ON "resources"."ResourceObservation"("tenant_id", "id");

ALTER TABLE "audit_package"."AuditPackageManifest" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "cpq"."CommercialQuoteLine" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "resources"."ResourceObservationWindow" ADD COLUMN "tenant_id" TEXT;

UPDATE "audit_package"."AuditPackageManifest" child
   SET "tenant_id" = parent."tenant_id"
  FROM "audit_package"."AuditPackage" parent
 WHERE parent."id" = child."package_id";
UPDATE "cpq"."CommercialQuoteLine" child
   SET "tenant_id" = parent."tenant_id"
  FROM "cpq"."CommercialQuote" parent
 WHERE parent."id" = child."quote_id";
UPDATE "resources"."ResourceObservationWindow" child
   SET "tenant_id" = parent."tenant_id"
  FROM "resources"."ResourceObservation" parent
 WHERE parent."id" = child."observation_id";

-- Every child had a parent (the old foreign keys guaranteed it), so none is
-- left NULL; SET NOT NULL fails loudly if that assumption is ever wrong.
ALTER TABLE "audit_package"."AuditPackageManifest" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "cpq"."CommercialQuoteLine" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "resources"."ResourceObservationWindow" ALTER COLUMN "tenant_id" SET NOT NULL;

CREATE UNIQUE INDEX "AuditPackageManifest_tenant_id_package_id_key" ON "audit_package"."AuditPackageManifest"("tenant_id", "package_id");
CREATE INDEX "CommercialQuoteLine_tenant_id_idx" ON "cpq"."CommercialQuoteLine"("tenant_id");
CREATE INDEX "ResourceObservationWindow_tenant_id_idx" ON "resources"."ResourceObservationWindow"("tenant_id");

ALTER TABLE "audit_package"."AuditPackageManifest" DROP CONSTRAINT "AuditPackageManifest_package_id_fkey";
ALTER TABLE "cpq"."CommercialQuoteLine" DROP CONSTRAINT "CommercialQuoteLine_quote_id_fkey";
ALTER TABLE "resources"."ResourceObservationWindow" DROP CONSTRAINT "ResourceObservationWindow_observation_id_fkey";

ALTER TABLE "audit_package"."AuditPackageManifest" ADD CONSTRAINT "AuditPackageManifest_tenant_id_package_id_fkey" FOREIGN KEY ("tenant_id", "package_id") REFERENCES "audit_package"."AuditPackage"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cpq"."CommercialQuoteLine" ADD CONSTRAINT "CommercialQuoteLine_tenant_id_quote_id_fkey" FOREIGN KEY ("tenant_id", "quote_id") REFERENCES "cpq"."CommercialQuote"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "resources"."ResourceObservationWindow" ADD CONSTRAINT "ResourceObservationWindow_tenant_id_observation_id_fkey" FOREIGN KEY ("tenant_id", "observation_id") REFERENCES "resources"."ResourceObservation"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
