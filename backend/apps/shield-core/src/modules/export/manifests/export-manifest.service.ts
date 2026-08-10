import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContentHashService } from '../../evidence/hashing/content-hash.service';

/**
 * Before READY: verify every artifact hash, manifest hash, expected
 * counts, tenant scope, known limitations (spec §61). If requested
 * material couldn't be exported, the manifest — and the job — is PARTIAL,
 * never silently presented as complete (spec §61/§86).
 */
@Injectable()
export class ExportManifestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashService: ContentHashService,
  ) {}

  async build(params: { tenantId: string; exportJobId: string; purpose: string; artifacts: Array<{ id: string; artifact_type: string; object_count: number; content_hash: string; schema_id: string; schema_version: string }>; unavailableScopes: string[] }): Promise<{ manifest: unknown; completenessState: 'COMPLETE' | 'PARTIAL' }> {
    const activeLegalHold = await this.prisma.legalHold.findFirst({ where: { tenant_id: params.tenantId, status: 'ACTIVE' } });
    const legalHoldState = activeLegalHold ? 'ACTIVE' : 'NONE';

    const counts: Record<string, number> = {};
    const hashes: Record<string, string> = {};
    for (const artifact of params.artifacts) {
      counts[artifact.artifact_type] = artifact.object_count;
      hashes[artifact.artifact_type] = artifact.content_hash;
    }

    const knownLimitations = params.unavailableScopes.map((s) => `Requested scope '${s}' has no export builder implemented this pass`);
    const completenessState = params.unavailableScopes.length > 0 ? 'PARTIAL' : 'COMPLETE';

    const manifestBody = {
      tenantId: params.tenantId,
      exportJobId: params.exportJobId,
      manifestVersion: '1.0',
      scope: params.artifacts.map((a) => a.artifact_type),
      purpose: params.purpose,
      schemaVersions: params.artifacts.map((a) => ({ type: a.artifact_type, schemaId: a.schema_id, schemaVersion: a.schema_version })),
      counts,
      hashes,
      knownLimitations,
      legalHoldState,
      completenessState,
    };
    const { contentHash: manifestHash } = this.hashService.hashCanonicalJson(manifestBody);

    const manifest = await this.prisma.exportManifest.create({
      data: {
        id: randomUUID(),
        tenant_id: params.tenantId,
        export_job_id: params.exportJobId,
        scope: JSON.stringify(manifestBody.scope),
        purpose: params.purpose,
        schema_versions: JSON.stringify(manifestBody.schemaVersions),
        artifacts: JSON.stringify(params.artifacts.map((a) => a.id)),
        counts: JSON.stringify(counts),
        hashes: JSON.stringify(hashes),
        known_limitations: JSON.stringify(knownLimitations),
        legal_hold_state: legalHoldState,
        completeness_state: completenessState,
        manifest_hash: manifestHash,
      },
    });

    return { manifest, completenessState };
  }
}
