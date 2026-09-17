-- AlterTable
ALTER TABLE "EvidenceRecord" ADD COLUMN     "collection_method" TEXT NOT NULL DEFAULT 'AUTOMATED',
ADD COLUMN     "expires_at" TIMESTAMP(3),
ADD COLUMN     "manual_review_required" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "manual_reviewed_at" TIMESTAMP(3),
ADD COLUMN     "manual_reviewed_by" TEXT,
ADD COLUMN     "upload_reason" TEXT,
ADD COLUMN     "uploader_identity" TEXT;
