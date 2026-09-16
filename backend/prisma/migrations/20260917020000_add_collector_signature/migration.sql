-- AlterTable
ALTER TABLE "EvidenceRecord" ADD COLUMN     "collector_nonce" TEXT,
ADD COLUMN     "collector_signature" TEXT,
ADD COLUMN     "collector_signing_key_id" TEXT;
