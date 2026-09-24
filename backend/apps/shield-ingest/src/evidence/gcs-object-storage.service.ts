import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Storage, type Bucket } from '@google-cloud/storage';

const EVIDENCE_BUCKET =
  process.env.EVIDENCE_GCS_BUCKET ||
  process.env.EVIDENCE_S3_BUCKET ||
  'zoiko-shield-evidence-worm';

const RETENTION_DAYS: Record<string, number> = {
  STANDARD: 90,
  EXTENDED: 365,
  LEGAL_HOLD: 2555,
};
const DEFAULT_RETENTION_DAYS = 90;

function retentionUntil(retentionProfile?: string, from = new Date()): Date {
  const days =
    RETENTION_DAYS[retentionProfile ?? 'STANDARD'] ?? DEFAULT_RETENTION_DAYS;
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Raw evidence storage on Google Cloud Storage, matching shield-core's
 * implementation so both services write with the same retention guarantee.
 *
 * Cloud Storage's S3-compatible XML API does not implement Object Lock, so
 * this uses the native API's object retention instead: `mode: 'Locked'`
 * cannot be shortened or cleared by anyone, which is the guarantee S3's
 * COMPLIANCE mode gives.
 */
@Injectable()
export class GcsObjectStorageService implements OnModuleInit {
  private readonly logger = new Logger(GcsObjectStorageService.name);
  private readonly storage: Storage;
  private readonly bucket: Bucket;
  private objectRetentionEnabled = false;

  constructor() {
    this.storage = new Storage({
      projectId: process.env.GOOGLE_CLOUD_PROJECT,
    });
    this.bucket = this.storage.bucket(EVIDENCE_BUCKET);
  }

  async onModuleInit(): Promise<void> {
    const [exists] = await this.bucket.exists().catch(() => [false]);
    if (!exists) {
      try {
        await this.storage.createBucket(EVIDENCE_BUCKET, {
          location: process.env.EVIDENCE_GCS_LOCATION || 'US',
          enableObjectRetention: true,
          versioning: { enabled: true },
        });
      } catch (err) {
        this.logger.error(
          `Could not provision evidence bucket '${EVIDENCE_BUCKET}': ${(err as Error).message}`,
        );
      }
    }

    // Read back rather than assume: object retention can only be enabled when
    // a bucket is created, so an existing bucket may not have it.
    this.objectRetentionEnabled = await this.bucket
      .getMetadata()
      .then(([metadata]) =>
        Boolean(
          (metadata as { objectRetention?: { mode?: string } }).objectRetention
            ?.mode,
        ),
      )
      .catch(() => false);

    if (!this.objectRetentionEnabled) {
      this.logger.warn(
        `Evidence bucket '${EVIDENCE_BUCKET}' does not enforce object retention. Evidence immutability rests on application discipline alone.`,
      );
    }
  }

  async putObject(
    objectKey: string,
    bytes: Buffer,
    mediaType: string,
    retentionProfile?: string,
  ): Promise<void> {
    const file = this.bucket.file(objectKey);
    await file.save(bytes, { contentType: mediaType, resumable: false });
    if (this.objectRetentionEnabled) {
      await file.setMetadata({
        retention: {
          mode: 'Locked',
          retainUntilTime: retentionUntil(retentionProfile).toISOString(),
        },
      });
    }
  }

  async getObject(objectKey: string): Promise<Buffer> {
    const [contents] = await this.bucket.file(objectKey).download();
    return contents;
  }
}
