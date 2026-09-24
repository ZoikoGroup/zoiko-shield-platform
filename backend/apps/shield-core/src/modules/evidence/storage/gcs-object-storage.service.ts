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
 * Evidence storage on Google Cloud Storage.
 *
 * The S3 implementation enforces WORM with per-object Object Lock in
 * COMPLIANCE mode. Cloud Storage's S3-compatible XML API does not implement
 * Object Lock at all, so going through the S3 client against GCS would have
 * accepted every write and quietly provided no immutability — the dangerous
 * shape of that failure, because nothing would look wrong.
 *
 * Cloud Storage's own API does have an equivalent: a bucket created with
 * `enableObjectRetention` accepts a per-object retention with
 * `mode: 'Locked'`, which cannot be shortened or removed by anyone, including
 * a project owner. That is the same guarantee COMPLIANCE mode gives, so this
 * is a faithful mapping rather than a weaker substitute.
 *
 * As on S3, the lock configuration is read back after bootstrap rather than
 * assumed: a bucket that already existed without object retention enabled
 * cannot have it turned on afterwards, and claiming WORM we do not have is
 * worse than admitting we lack it.
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
      // Credentials come from the ambient service account on Cloud Run/GKE, or
      // GOOGLE_APPLICATION_CREDENTIALS elsewhere. A key file is never required.
    });
    this.bucket = this.storage.bucket(EVIDENCE_BUCKET);
  }

  async onModuleInit(): Promise<void> {
    const [exists] = await this.bucket.exists().catch(() => [false]);

    if (!exists) {
      try {
        await this.storage.createBucket(EVIDENCE_BUCKET, {
          location: process.env.EVIDENCE_GCS_LOCATION || 'US',
          // Both must be set at creation. Neither can be retrofitted, which
          // is why an existing bucket is used as found below.
          enableObjectRetention: true,
          versioning: { enabled: true },
        });
        this.logger.log(
          `Created evidence bucket '${EVIDENCE_BUCKET}' with object retention and versioning enabled.`,
        );
      } catch (err) {
        this.logger.error(
          `Could not provision evidence bucket '${EVIDENCE_BUCKET}': ${(err as Error).message}`,
        );
      }
    }

    this.objectRetentionEnabled = await this.bucket
      .getMetadata()
      .then(([metadata]) =>
        Boolean(
          (metadata as { objectRetention?: { mode?: string } }).objectRetention
            ?.mode,
        ),
      )
      .catch(() => false);

    if (this.objectRetentionEnabled) {
      this.logger.log(
        `Evidence bucket '${EVIDENCE_BUCKET}' has object retention enabled; committed evidence is retained immutably.`,
      );
    } else {
      this.logger.warn(
        `Evidence bucket '${EVIDENCE_BUCKET}' does not enforce object retention. Evidence immutability rests on application discipline alone — object retention can only be enabled when a bucket is created, so an existing bucket must be replaced to gain it.`,
      );
    }
  }

  buildObjectKey(tenantId: string, evidenceId: string): string {
    return `${tenantId}/${evidenceId}`;
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
      // 'Locked' is Cloud Storage's equivalent of COMPLIANCE: the retain-until
      // date can be extended but never shortened or cleared, by anyone.
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

  async deleteObject(objectKey: string): Promise<void> {
    await this.bucket.file(objectKey).delete({ ignoreNotFound: true });
  }

  /**
   * Tenant purge under object retention.
   *
   * Mirrors the S3 implementation: enumerate every generation, permanently
   * delete the ones retention permits, and report what retention kept along
   * with the date it actually expires. A retained object is not reported as
   * deleted, because that is the fabricated success ZS-ENG-OFF-DEL-001 §3.1
   * forbids. The tenant's key material is destroyed separately (the
   * CRYPTO_SHRED task), which is what makes retained ciphertext unreadable
   * meanwhile.
   */
  async purgeTenantObjects(tenantId: string): Promise<{
    permanentlyDeleted: number;
    wormRetained: number;
    deleteMarkersPlaced: number;
    physicalExpiryAt: string | null;
  }> {
    const [files] = await this.bucket.getFiles({
      prefix: `${tenantId}/`,
      versions: true,
    });

    let permanentlyDeleted = 0;
    let wormRetained = 0;
    let physicalExpiry: Date | null = null;

    for (const file of files) {
      const until = this.retainUntil(file.metadata);
      if (until && until.getTime() > Date.now()) {
        wormRetained += 1;
        if (!physicalExpiry || until > physicalExpiry) physicalExpiry = until;
        continue;
      }
      try {
        await file.delete();
        permanentlyDeleted += 1;
      } catch (err) {
        // Retention refused the delete even though the metadata did not say
        // so. Counted as retained rather than deleted: the bytes are there.
        wormRetained += 1;
        this.logger.warn(
          `Could not delete ${file.name} (generation ${file.generation}): ${(err as Error).message}`,
        );
      }
    }

    return {
      permanentlyDeleted,
      wormRetained,
      // Cloud Storage has no delete-marker concept; a delete either removes
      // the generation or is refused. Always zero, kept for a single
      // attestation shape across both stores.
      deleteMarkersPlaced: 0,
      physicalExpiryAt: physicalExpiry ? physicalExpiry.toISOString() : null,
    };
  }

  async countTenantObjectVersions(tenantId: string): Promise<number> {
    const [files] = await this.bucket.getFiles({
      prefix: `${tenantId}/`,
      versions: true,
    });
    return files.length;
  }

  /**
   * Splits what is still physically stored for a tenant into generations a
   * retention lock explains, and generations nothing explains. Only the
   * second kind is a residual: an unauthorized survivor that must block
   * attestation.
   */
  async classifyTenantObjectVersions(tenantId: string): Promise<{
    lockRetained: number;
    unexplained: number;
    maxRetainUntil: string | null;
  }> {
    const [files] = await this.bucket.getFiles({
      prefix: `${tenantId}/`,
      versions: true,
    });

    let lockRetained = 0;
    let unexplained = 0;
    let maxRetainUntil: Date | null = null;

    for (const file of files) {
      const until = this.retainUntil(file.metadata);
      if (until && until.getTime() > Date.now()) {
        lockRetained += 1;
        if (!maxRetainUntil || until > maxRetainUntil) maxRetainUntil = until;
      } else {
        unexplained += 1;
      }
    }

    return {
      lockRetained,
      unexplained,
      maxRetainUntil: maxRetainUntil ? maxRetainUntil.toISOString() : null,
    };
  }

  private retainUntil(metadata: unknown): Date | null {
    const retention = (
      metadata as { retention?: { retainUntilTime?: string } } | undefined
    )?.retention;
    if (!retention?.retainUntilTime) return null;
    const until = new Date(retention.retainUntilTime);
    return Number.isNaN(until.getTime()) ? null : until;
  }
}
