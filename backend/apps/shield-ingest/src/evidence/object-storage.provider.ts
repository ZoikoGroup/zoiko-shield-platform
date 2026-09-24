import { Logger, type Provider } from '@nestjs/common';
import { ObjectStorageService } from './object-storage.service';
import { GcsObjectStorageService } from './gcs-object-storage.service';

/**
 * Same selection rule as shield-core's: Cloud Storage when configured for it,
 * the S3 client otherwise. Both services must agree, or evidence written by
 * one would be unreadable by the other.
 */
export const objectStorageProvider: Provider = {
  provide: ObjectStorageService,
  useFactory: () => {
    const useGcs = Boolean(
      process.env.EVIDENCE_GCS_BUCKET?.trim() &&
        process.env.GOOGLE_CLOUD_PROJECT?.trim(),
    );
    new Logger('ObjectStorage').log(
      useGcs
        ? 'Storing raw evidence in Google Cloud Storage.'
        : 'Storing raw evidence through the S3 client (MinIO locally).',
    );
    return useGcs ? new GcsObjectStorageService() : new ObjectStorageService();
  },
};
