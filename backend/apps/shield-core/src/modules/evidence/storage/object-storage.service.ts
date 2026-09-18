import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectVersionsCommand,
  GetObjectRetentionCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketVersioningCommand,
  PutObjectLockConfigurationCommand,
  GetObjectLockConfigurationCommand,
} from '@aws-sdk/client-s3';

const EVIDENCE_BUCKET =
  process.env.EVIDENCE_S3_BUCKET || 'zoiko-shield-evidence';

/**
 * How long committed evidence stays immutable, by retention profile. Object
 * Lock is what actually enforces "immutable after commit" — without it the
 * guarantee is only this application's own good manners, and anyone with
 * bucket credentials can overwrite or delete stored evidence.
 */
const RETENTION_DAYS: Record<string, number> = {
  STANDARD: 90,
  '30_DAYS': 30,
  '90_DAYS': 90,
  '180_DAYS': 180,
  '365_DAYS': 365,
  '7_YEARS': 2555,
};
const DEFAULT_RETENTION_DAYS = 90;

export function retentionUntil(
  retentionProfile: string | undefined,
  from: Date = new Date(),
): Date {
  const days =
    RETENTION_DAYS[retentionProfile ?? 'STANDARD'] ?? DEFAULT_RETENTION_DAYS;
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Evidence bytes go to object storage (MinIO locally, an approved
 * S3-compatible/cloud store in production) — never as PostgreSQL row
 * content (spec §19/§34). The vault_reference stored on EvidenceRecord is
 * the object key, resolvable back through this service.
 */
@Injectable()
export class ObjectStorageService implements OnModuleInit {
  private readonly logger = new Logger(ObjectStorageService.name);
  private readonly client: S3Client;
  private objectLockEnabled = false;

  constructor() {
    this.client = new S3Client({
      endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
      region: 'us-east-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || '',
        secretAccessKey: process.env.S3_SECRET_KEY || '',
      },
      forcePathStyle: true,
    });
  }

  /**
   * Object Lock can only be turned on when a bucket is created, so an existing
   * bucket is used as found rather than pretending the guarantee can be
   * retrofitted. Either way the result is confirmed by reading the lock
   * configuration back — some S3-compatible stores (including MinIO in
   * single-drive mode) accept the request and silently do not enforce it, and
   * claiming WORM we do not actually have is worse than admitting we lack it.
   */
  async onModuleInit(): Promise<void> {
    const bucketExists = await this.client
      .send(new HeadBucketCommand({ Bucket: EVIDENCE_BUCKET }))
      .then(() => true)
      .catch(() => false);

    if (!bucketExists) {
      try {
        await this.client.send(
          new CreateBucketCommand({
            Bucket: EVIDENCE_BUCKET,
            ObjectLockEnabledForBucket: true,
          }),
        );
        await this.client.send(
          new PutBucketVersioningCommand({
            Bucket: EVIDENCE_BUCKET,
            VersioningConfiguration: { Status: 'Enabled' },
          }),
        );
        await this.client.send(
          new PutObjectLockConfigurationCommand({
            Bucket: EVIDENCE_BUCKET,
            ObjectLockConfiguration: { ObjectLockEnabled: 'Enabled' },
          }),
        );
      } catch (err) {
        this.logger.error(
          `Could not provision evidence bucket '${EVIDENCE_BUCKET}': ${(err as Error).message}`,
        );
      }
    }

    this.objectLockEnabled = await this.client
      .send(new GetObjectLockConfigurationCommand({ Bucket: EVIDENCE_BUCKET }))
      .then(
        (outcome) =>
          outcome.ObjectLockConfiguration?.ObjectLockEnabled === 'Enabled',
      )
      .catch(() => false);

    if (this.objectLockEnabled) {
      this.logger.log(
        `Evidence bucket '${EVIDENCE_BUCKET}' has Object Lock enabled; committed evidence is retained immutably.`,
      );
    } else {
      this.logger.warn(
        `Evidence bucket '${EVIDENCE_BUCKET}' does not enforce Object Lock. Evidence immutability rests on application discipline alone — use an S3-compatible store with Object Lock support (MinIO needs erasure-coded mode) to enforce it.`,
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
    await this.client.send(
      new PutObjectCommand({
        Bucket: EVIDENCE_BUCKET,
        Key: objectKey,
        Body: bytes,
        ContentType: mediaType,
        // COMPLIANCE mode: not even a root credential can shorten the window.
        ...(this.objectLockEnabled
          ? {
              ObjectLockMode: 'COMPLIANCE' as const,
              ObjectLockRetainUntilDate: retentionUntil(retentionProfile),
            }
          : {}),
      }),
    );
  }

  async getObject(objectKey: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: EVIDENCE_BUCKET, Key: objectKey }),
    );
    const chunks: Buffer[] = [];
    for await (const chunk of result.Body as any) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: EVIDENCE_BUCKET, Key: objectKey }),
    );
  }

  /**
   * Tenant purge under Object Lock.
   *
   * A plain delete against a versioned, lock-enabled bucket only inserts a
   * delete marker: the call succeeds, a subsequent ListObjectsV2 returns
   * nothing, and every byte is still physically present under a COMPLIANCE
   * retention that nobody — not even a root credential — can shorten.
   * Reporting that as a verified deletion would be exactly the fabricated
   * success ZS-ENG-OFF-DEL-001 §3.1 forbids.
   *
   * So this enumerates real versions, permanently destroys every one it is
   * allowed to, and reports what WORM kept together with the date that
   * retention actually expires. The tenant's key material is destroyed
   * separately (the CRYPTO_SHRED task), which is what makes any retained
   * ciphertext unreadable meanwhile; the residue is then disclosed in the
   * attestation rather than hidden behind a delete marker.
   */
  async purgeTenantObjects(tenantId: string): Promise<{
    permanentlyDeleted: number;
    wormRetained: number;
    deleteMarkersPlaced: number;
    physicalExpiryAt: string | null;
  }> {
    const prefix = `${tenantId}/`;
    let permanentlyDeleted = 0;
    let wormRetained = 0;
    let deleteMarkersPlaced = 0;
    let physicalExpiry: Date | null = null;
    const retainedKeys = new Set<string>();

    let keyMarker: string | undefined;
    let versionIdMarker: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectVersionsCommand({
          Bucket: EVIDENCE_BUCKET,
          Prefix: prefix,
          KeyMarker: keyMarker,
          VersionIdMarker: versionIdMarker,
        }),
      );

      for (const version of page.Versions ?? []) {
        if (!version.Key || !version.VersionId) continue;
        try {
          await this.client.send(
            new DeleteObjectCommand({
              Bucket: EVIDENCE_BUCKET,
              Key: version.Key,
              VersionId: version.VersionId,
            }),
          );
          permanentlyDeleted += 1;
        } catch {
          // Refused by Object Lock. Record when these bytes actually become
          // deletable instead of pretending they are already gone.
          wormRetained += 1;
          retainedKeys.add(version.Key);
          const until = await this.retainUntil(version.Key, version.VersionId);
          if (until && (!physicalExpiry || until > physicalExpiry)) {
            physicalExpiry = until;
          }
        }
      }

      // Delete markers hold no data and are never locked.
      for (const marker of page.DeleteMarkers ?? []) {
        if (!marker.Key || !marker.VersionId) continue;
        await this.client.send(
          new DeleteObjectCommand({
            Bucket: EVIDENCE_BUCKET,
            Key: marker.Key,
            VersionId: marker.VersionId,
          }),
        );
      }

      keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
      versionIdMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
    } while (keyMarker || versionIdMarker);

    // Whatever WORM kept must at least stop being reachable through a normal
    // read, so cover each surviving key with a delete marker.
    for (const key of retainedKeys) {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: EVIDENCE_BUCKET, Key: key }),
      );
      deleteMarkersPlaced += 1;
    }

    return {
      permanentlyDeleted,
      wormRetained,
      deleteMarkersPlaced,
      physicalExpiryAt: physicalExpiry ? physicalExpiry.toISOString() : null,
    };
  }

  /** Real (non-delete-marker) versions still stored for a tenant. */
  async countTenantObjectVersions(tenantId: string): Promise<number> {
    const prefix = `${tenantId}/`;
    let total = 0;
    let keyMarker: string | undefined;
    let versionIdMarker: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectVersionsCommand({
          Bucket: EVIDENCE_BUCKET,
          Prefix: prefix,
          KeyMarker: keyMarker,
          VersionIdMarker: versionIdMarker,
        }),
      );
      total += (page.Versions ?? []).length;
      keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
      versionIdMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
    } while (keyMarker || versionIdMarker);
    return total;
  }

  /**
   * Splits what is still physically stored for a tenant into versions a
   * retention lock explains, and versions nothing explains. Only the second
   * kind is a residual: an unauthorized survivor that must block attestation.
   */
  async classifyTenantObjectVersions(tenantId: string): Promise<{
    lockRetained: number;
    unexplained: number;
    maxRetainUntil: string | null;
  }> {
    const prefix = `${tenantId}/`;
    let lockRetained = 0;
    let unexplained = 0;
    let maxRetainUntil: Date | null = null;
    let keyMarker: string | undefined;
    let versionIdMarker: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectVersionsCommand({
          Bucket: EVIDENCE_BUCKET,
          Prefix: prefix,
          KeyMarker: keyMarker,
          VersionIdMarker: versionIdMarker,
        }),
      );
      for (const version of page.Versions ?? []) {
        if (!version.Key || !version.VersionId) continue;
        const until = await this.retainUntil(version.Key, version.VersionId);
        if (until && until.getTime() > Date.now()) {
          lockRetained += 1;
          if (!maxRetainUntil || until > maxRetainUntil) maxRetainUntil = until;
        } else {
          unexplained += 1;
        }
      }
      keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
      versionIdMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
    } while (keyMarker || versionIdMarker);
    return {
      lockRetained,
      unexplained,
      maxRetainUntil: maxRetainUntil ? maxRetainUntil.toISOString() : null,
    };
  }

  private async retainUntil(
    key: string,
    versionId: string,
  ): Promise<Date | null> {
    try {
      const retention = await this.client.send(
        new GetObjectRetentionCommand({
          Bucket: EVIDENCE_BUCKET,
          Key: key,
          VersionId: versionId,
        }),
      );
      const until = retention.Retention?.RetainUntilDate;
      return until ? new Date(until) : null;
    } catch {
      return null;
    }
  }
}
