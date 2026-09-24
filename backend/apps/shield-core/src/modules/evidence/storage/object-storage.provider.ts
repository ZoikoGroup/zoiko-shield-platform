import { Logger, type Provider } from '@nestjs/common';
import { ObjectStorageService } from './object-storage.service';
import { GcsObjectStorageService } from './gcs-object-storage.service';

/**
 * Picks the evidence store by what is configured, not by a flag someone can
 * set wrongly.
 *
 * Google Cloud Storage when a bucket and project are configured for it;
 * otherwise the S3 client, which is what talks to MinIO locally. The two
 * classes expose the same surface, and every consumer injects
 * ObjectStorageService, so nothing downstream knows or cares which is running.
 *
 * Cloud Storage is not reached through the S3 client even though its XML API
 * is S3-compatible: that API does not implement Object Lock, so evidence would
 * be written with no immutability and nothing would look wrong.
 */
export function usingGoogleCloudStorage(): boolean {
  return Boolean(
    process.env.EVIDENCE_GCS_BUCKET?.trim() &&
      process.env.GOOGLE_CLOUD_PROJECT?.trim(),
  );
}

export const objectStorageProvider: Provider = {
  provide: ObjectStorageService,
  useFactory: () => {
    const logger = new Logger('ObjectStorage');
    if (usingGoogleCloudStorage()) {
      logger.log('Storing evidence in Google Cloud Storage.');
      return new GcsObjectStorageService();
    }
    logger.log(
      'Storing evidence through the S3 client (MinIO locally, or an S3-compatible store). Set EVIDENCE_GCS_BUCKET and GOOGLE_CLOUD_PROJECT to use Cloud Storage.',
    );
    return new ObjectStorageService();
  },
};
