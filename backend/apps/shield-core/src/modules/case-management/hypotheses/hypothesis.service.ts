import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export type HypothesisStatus =
  'OPEN' | 'SUPPORTED' | 'REJECTED' | 'INCONCLUSIVE';

/** Spec §16 — hypotheses are never treated as confirmed facts; status stays explicit and analyst-set. */
@Injectable()
export class HypothesisService {
  constructor(private readonly prisma: PrismaService) {}

  async create(params: {
    tenantId: string;
    caseId: string;
    statement: string;
    createdBy: string;
  }) {
    return this.prisma.investigationHypothesis.create({
      data: {
        tenant_id: params.tenantId,
        case_id: params.caseId,
        statement: params.statement,
        created_by: params.createdBy,
        status: 'OPEN',
      },
    });
  }

  async resolve(params: {
    tenantId: string;
    hypothesisId: string;
    status: Exclude<HypothesisStatus, 'OPEN'>;
    supportingEvidenceRefs?: string[];
    contradictingEvidenceRefs?: string[];
  }) {
    return this.prisma.investigationHypothesis.update({
      where: { id: params.hypothesisId },
      data: {
        status: params.status,
        supporting_evidence_refs: JSON.stringify(
          params.supportingEvidenceRefs ?? [],
        ),
        contradicting_evidence_refs: JSON.stringify(
          params.contradictingEvidenceRefs ?? [],
        ),
        resolved_at: new Date(),
      },
    });
  }

  async listForCase(tenantId: string, caseId: string) {
    return this.prisma.investigationHypothesis.findMany({
      where: { tenant_id: tenantId, case_id: caseId },
      orderBy: { created_at: 'asc' },
    });
  }
}
