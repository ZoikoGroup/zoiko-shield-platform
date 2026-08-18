import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../../../prisma/prisma.service';
import { ObjectStorageService } from '../../evidence/storage/object-storage.service';

/** Machine-readable manifest is authoritative — no PDF/HTML projection this pass (spec §43). */
@Injectable()
export class AuditPackageExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: ObjectStorageService,
  ) {}

  async exportManifest(
    tenantId: string,
    packageId: string,
  ): Promise<Record<string, unknown>> {
    const pkg = await this.prisma.auditPackage.findFirst({
      where: { id: packageId, tenant_id: tenantId },
    });
    if (!pkg) {
      throw new NotFoundException(`AuditPackage '${packageId}' not found`);
    }
    const manifest = await this.prisma.auditPackageManifest.findUnique({
      where: { package_id: pkg.id },
    });
    if (!manifest) {
      throw new NotFoundException(
        `AuditPackage '${packageId}' has no manifest`,
      );
    }
    if (pkg.status === 'FROZEN' && manifest.manifest_content) {
      return JSON.parse(manifest.manifest_content);
    }
    return JSON.parse(manifest.manifest_core_content);
  }

  async exportEvidenceIndexJsonl(
    tenantId: string,
    packageId: string,
  ): Promise<string> {
    const manifest = await this.exportManifest(tenantId, packageId);
    const evidenceIndex = (manifest.evidenceIndex ?? []) as Record<
      string,
      unknown
    >[];
    return evidenceIndex.map((e) => JSON.stringify(e)).join('\n');
  }

  /**
   * Writes the self-contained bundle the independent verifier expects:
   * manifest.json (the final envelope), envelope.json (packageId/version/
   * packageEnvelopeHash — kept OUTSIDE the hashed manifest content so the
   * verifier has something external to compare against), and an optional
   * evidence/ subfolder with raw bytes for byte-level re-verification.
   */
  async exportToDirectory(
    tenantId: string,
    packageId: string,
    dirPath: string,
    includeEvidenceBytes = true,
  ): Promise<void> {
    const pkg = await this.prisma.auditPackage.findFirst({
      where: { id: packageId, tenant_id: tenantId },
    });
    if (!pkg) {
      throw new NotFoundException(`AuditPackage '${packageId}' not found`);
    }
    if (pkg.status !== 'FROZEN') {
      throw new ConflictException(
        `AuditPackage '${packageId}' must be FROZEN to export for independent verification (currently ${pkg.status})`,
      );
    }
    const manifest = await this.prisma.auditPackageManifest.findUnique({
      where: { package_id: pkg.id },
    });
    if (
      !manifest ||
      !manifest.manifest_content ||
      !manifest.package_envelope_hash
    ) {
      throw new NotFoundException(
        `AuditPackage '${packageId}' has no frozen manifest`,
      );
    }

    mkdirSync(dirPath, { recursive: true });
    writeFileSync(
      join(dirPath, 'manifest.json'),
      manifest.manifest_content,
      'utf-8',
    );
    writeFileSync(
      join(dirPath, 'envelope.json'),
      JSON.stringify(
        {
          packageId: pkg.id,
          packageVersion: pkg.version,
          packageEnvelopeHash: manifest.package_envelope_hash,
        },
        null,
        2,
      ),
      'utf-8',
    );

    if (includeEvidenceBytes) {
      const finalManifest = JSON.parse(manifest.manifest_content);
      const evidenceIndex: Array<{
        evidenceId: string;
        vaultReference?: string;
      }> = finalManifest.evidenceIndex ?? [];
      if (evidenceIndex.length > 0) {
        const evidenceDir = join(dirPath, 'evidence');
        mkdirSync(evidenceDir, { recursive: true });
        for (const entry of evidenceIndex) {
          if (!entry.vaultReference) continue;
          try {
            const bytes = await this.storageService.getObject(
              entry.vaultReference,
            );
            writeFileSync(join(evidenceDir, `${entry.evidenceId}.json`), bytes);
          } catch {
            // Evidence bytes unavailable — the verifier reports NOT_PROVIDED for this case, never a false VERIFIED.
          }
        }
      }
    }
  }
}
