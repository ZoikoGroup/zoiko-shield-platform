import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
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

  async deleteTenantObjects(
    tenantId: string,
  ): Promise<{ deleted: number; remaining: number }> {
    const prefix = `${tenantId}/`;
    let deleted = 0;
    let continuationToken: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: EVIDENCE_BUCKET,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      const keys = (page.Contents ?? []).flatMap((entry) =>
        entry.Key ? [{ Key: entry.Key }] : [],
      );
      if (keys.length > 0) {
        const outcome = await this.client.send(
          new DeleteObjectsCommand({
            Bucket: EVIDENCE_BUCKET,
            Delete: { Objects: keys, Quiet: true },
          }),
        );
        if ((outcome.Errors ?? []).length > 0) {
          throw new Error(
            `Object storage deletion failed for ${(outcome.Errors ?? []).length} object(s)`,
          );
        }
        deleted += keys.length;
      }
      continuationToken = page.IsTruncated
        ? page.NextContinuationToken
        : undefined;
    } while (continuationToken);

    const verification = await this.client.send(
      new ListObjectsV2Command({
        Bucket: EVIDENCE_BUCKET,
        Prefix: prefix,
        MaxKeys: 1,
      }),
    );
    return {
      deleted,
      remaining: verification.KeyCount ?? verification.Contents?.length ?? 0,
    };
  }
}
