import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class EvidenceLineageService {
  constructor(private readonly prisma: PrismaService) {}

  async link(params: {
    tenantId: string;
    evidenceId: string;
    parentEvidenceId: string;
    relationship: string;
    transformationType?: string;
    transformationVersion?: string;
  }) {
    return this.prisma.evidenceLineage.create({
      data: {
        tenant_id: params.tenantId,
        evidence_id: params.evidenceId,
        parent_evidence_id: params.parentEvidenceId,
        relationship: params.relationship,
        transformation_type: params.transformationType,
        transformation_version: params.transformationVersion,
      },
    });
  }

  /** Reconstructs the full chain (spec §24): Raw -> Normalized -> Context -> Detection -> Alert, following parent links. */
  async reconstruct(tenantId: string, evidenceId: string) {
    const chain: Array<{ evidenceId: string; relationship: string }> = [];
    let currentId: string | undefined = evidenceId;

    // Bounded walk — lineage graphs in this domain are shallow (a handful
    // of hops from raw event to alert); a hard cap avoids infinite loops
    // if a cycle is ever introduced by a bug.
    for (let hops = 0; hops < 20 && currentId; hops++) {
      const evidenceIdToLookup: string = currentId;
      const link: { parent_evidence_id: string; relationship: string } | null = await this.prisma.evidenceLineage.findFirst({
        where: { tenant_id: tenantId, evidence_id: evidenceIdToLookup },
      });
      if (!link) break;
      chain.push({ evidenceId: link.parent_evidence_id, relationship: link.relationship });
      currentId = link.parent_evidence_id;
    }

    return chain;
  }
}
