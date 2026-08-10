import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const EVIDENCE_BUCKET = process.env.EVIDENCE_S3_BUCKET || 'zoiko-shield-evidence';

/**
 * Evidence bytes go to object storage (MinIO locally, an approved
 * S3-compatible/cloud store in production) — never as PostgreSQL row
 * content (spec §19/§34). The vault_reference stored on EvidenceRecord is
 * the object key, resolvable back through this service.
 */
@Injectable()
export class ObjectStorageService {
  private readonly logger = new Logger(ObjectStorageService.name);
  private readonly client: S3Client;

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

  buildObjectKey(tenantId: string, evidenceId: string): string {
    return `${tenantId}/${evidenceId}`;
  }

  async putObject(objectKey: string, bytes: Buffer, mediaType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: EVIDENCE_BUCKET,
        Key: objectKey,
        Body: bytes,
        ContentType: mediaType,
      }),
    );
  }

  async getObject(objectKey: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: EVIDENCE_BUCKET, Key: objectKey }));
    const chunks: Buffer[] = [];
    for await (const chunk of result.Body as any) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}
