import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContentHashService } from '../../evidence/hashing/content-hash.service';

export interface FreezeBundleInput {
  tenantId: string;
  purpose: string;
  controlTestVersionId: string;
  expectedEvidenceResultId?: string;
  evidenceRecords: Array<{ id: string; content_hash: string }>;
  mappingVersions?: string[];
  contextVersions?: string[];
}

/**
 * Freezes the exact inputs an assessment/evaluation uses (spec §17).
 * Historical replay must use this frozen snapshot — original evidence IDs
 * + their content_hash at freeze time, original mapping/context versions —
 * never "whatever is current" at replay time.
 */
@Injectable()
export class EvidenceBundleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashService: ContentHashService,
  ) {}

  async freeze(input: FreezeBundleInput) {
    const evidenceRefs = input.evidenceRecords.map((r) => r.id);
    const evidenceHashes = input.evidenceRecords.map((r) => r.content_hash);
    const mappingVersions = input.mappingVersions ?? [];
    const contextVersions = input.contextVersions ?? [];

    const { contentHash: bundleHash } = this.hashService.hashCanonicalJson({
      evidenceRefs,
      evidenceHashes,
      mappingVersions,
      contextVersions,
    });

    return this.prisma.evidenceBundle.create({
      data: {
        id: randomUUID(),
        tenant_id: input.tenantId,
        purpose: input.purpose,
        control_test_version_id: input.controlTestVersionId,
        expected_evidence_result_id: input.expectedEvidenceResultId,
        evidence_refs: JSON.stringify(evidenceRefs),
        evidence_hashes: JSON.stringify(evidenceHashes),
        mapping_versions: JSON.stringify(mappingVersions),
        context_versions: JSON.stringify(contextVersions),
        bundle_hash: bundleHash,
      },
    });
  }

  async getById(bundleId: string) {
    const bundle = await this.prisma.evidenceBundle.findUnique({ where: { id: bundleId } });
    if (!bundle) {
      throw new NotFoundException(`EvidenceBundle '${bundleId}' not found`);
    }
    return bundle;
  }
}
