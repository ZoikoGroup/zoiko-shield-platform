import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContentHashService } from '../../evidence/hashing/content-hash.service';
import { ObjectStorageService } from '../../evidence/storage/object-storage.service';

const SCOPE_BUILDERS: Record<
  string,
  (prisma: PrismaService, tenantId: string) => Promise<unknown[]>
> = {
  cases: (prisma, tenantId) =>
    prisma.case.findMany({ where: { tenant_id: tenantId } }),
  alerts: (prisma, tenantId) =>
    prisma.alert.findMany({ where: { tenant_id: tenantId } }),
  controls: (prisma, tenantId) =>
    prisma.controlImplementation.findMany({ where: { tenant_id: tenantId } }),
  assessments: (prisma, tenantId) =>
    prisma.assessment.findMany({ where: { tenant_id: tenantId } }),
  risks: (prisma, tenantId) =>
    prisma.risk.findMany({ where: { tenant_id: tenantId } }),
  exceptions: (prisma, tenantId) =>
    prisma.exception.findMany({ where: { tenant_id: tenantId } }),
  evidence_metadata: (prisma, tenantId) =>
    prisma.evidenceRecord.findMany({ where: { tenant_id: tenantId } }),
  audit_packages: (prisma, tenantId) =>
    prisma.auditPackage.findMany({ where: { tenant_id: tenantId } }),
};

/**
 * Builds one ExportArtifact per requested scope object type. Object
 * storage writes are best-effort (same trade-off as
 * AuditPackageFreezeService — Postgres-tracked content_hash is what
 * integrity verification relies on, S3 is a distribution convenience).
 * Scope entries with no known builder are recorded as unavailable, never
 * silently dropped.
 */
@Injectable()
export class ExportBuilderService {
  private readonly logger = new Logger(ExportBuilderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hashService: ContentHashService,
    private readonly storageService: ObjectStorageService,
  ) {}

  async buildArtifacts(
    tenantId: string,
    exportJobId: string,
    requestedScope: string[],
  ) {
    const artifacts: Array<{
      id: string;
      artifact_type: string;
      object_count: number;
      content_hash: string;
      schema_id: string;
      schema_version: string;
    }> = [];
    const unavailableScopes: string[] = [];

    for (const scopeKey of requestedScope) {
      const builder = SCOPE_BUILDERS[scopeKey];
      if (!builder) {
        unavailableScopes.push(scopeKey);
        continue;
      }

      const rows = await builder(this.prisma, tenantId);
      const content = JSON.stringify(rows);
      const { contentHash } = this.hashService.hashCanonicalJson(rows);
      const objectKey = `exports/${exportJobId}/${scopeKey}.json`;

      await this.storageService
        .putObject(objectKey, Buffer.from(content, 'utf-8'), 'application/json')
        .catch((err) => {
          this.logger.warn(
            `Object storage export failed for scope '${scopeKey}' of export ${exportJobId}: ${(err as Error).message}`,
          );
        });

      const artifact = await this.prisma.exportArtifact.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          export_job_id: exportJobId,
          artifact_type: scopeKey,
          schema_id: `zs-export-${scopeKey}-v1`,
          schema_version: '1.0',
          object_count: rows.length,
          content_hash: contentHash,
          object_storage_ref: objectKey,
          size_bytes: Buffer.byteLength(content, 'utf-8'),
        },
      });
      artifacts.push(artifact);
    }

    return { artifacts, unavailableScopes };
  }
}
