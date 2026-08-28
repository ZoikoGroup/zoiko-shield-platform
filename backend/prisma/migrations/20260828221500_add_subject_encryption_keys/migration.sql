CREATE TABLE "SubjectEncryptionKey" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "wrapped_key" TEXT NOT NULL,
    "wrapping_key_ref" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "shredded_at" TIMESTAMP(3),
    "erasure_certificate_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubjectEncryptionKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubjectEncryptionKey_erasure_certificate_id_key"
  ON "SubjectEncryptionKey"("erasure_certificate_id");
CREATE UNIQUE INDEX "SubjectEncryptionKey_tenant_id_subject_id_key_version_key"
  ON "SubjectEncryptionKey"("tenant_id", "subject_id", "key_version");
CREATE INDEX "SubjectEncryptionKey_tenant_id_subject_id_status_idx"
  ON "SubjectEncryptionKey"("tenant_id", "subject_id", "status");