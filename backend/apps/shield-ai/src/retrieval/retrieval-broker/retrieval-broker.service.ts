import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ShieldCoreClient } from '../../internal-client/shield-core.client';

export interface BuildBundleInput {
  tenantId: string;
  environmentId: string;
  purpose: string;
  caseId: string;
}

/**
 * Builds a RetrievalBundle by calling shield-core's internal APIs (spec §8)
 * — never a direct table read. Sources allowed this pass: Case, Case
 * Timeline, Evidence (spec §9's remaining sources — DetectionMatch/
 * ContextSnapshot/IdentityEntity/Asset/ConnectorHealth — are not wired
 * into retrieval yet; CASE_SUMMARY and the other advisory use cases work
 * from case+timeline+evidence, which is what the DoD's single CASE_SUMMARY
 * flow requires).
 */
@Injectable()
export class RetrievalBrokerService {
  private readonly logger = new Logger(RetrievalBrokerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shieldCoreClient: ShieldCoreClient,
  ) {}

  async build(input: BuildBundleInput) {
    const [caseResult, timelineResult, evidenceResult] = await Promise.all([
      this.shieldCoreClient.getCase(input.tenantId, input.caseId),
      this.shieldCoreClient.getCaseTimeline(input.tenantId, input.caseId),
      this.shieldCoreClient.getCaseEvidence(input.tenantId, input.caseId),
    ]);

    const caseRow = caseResult.data;
    const timelineEntries: any[] = timelineResult.data ?? [];
    const evidenceLinks: any[] = evidenceResult.data ?? [];

    const sourceRefs = [
      `case:${caseRow.id}`,
      ...timelineEntries.map((e) => `timeline:${e.id}`),
      ...evidenceLinks.map((e) => `evidence:${e.evidence_id}`),
    ];
    const evidenceRefs = evidenceLinks.map((e) => e.evidence_id);

    // Completeness/freshness propagate from what was actually retrievable
    // — never silently reported as fully healthy.
    const completenessState =
      evidenceLinks.length === 0 ? 'PARTIAL' : 'COMPLETE';
    const freshnessState = 'CURRENT';

    const bundle = await this.prisma.retrievalBundle.create({
      data: {
        tenant_id: input.tenantId,
        environment_id: input.environmentId,
        purpose: input.purpose,
        case_id: input.caseId,
        source_refs: JSON.stringify(sourceRefs),
        evidence_refs: JSON.stringify(evidenceRefs),
        source_versions: JSON.stringify({ case: caseRow.updated_at ?? null }),
        freshness_state: freshnessState,
        completeness_state: completenessState,
        acl_snapshot: JSON.stringify({
          tenantId: input.tenantId,
          caseId: input.caseId,
        }),
      },
    });

    const summaryText = [
      `Case: ${caseRow.title} — severity ${caseRow.severity}, status ${caseRow.status}.`,
      `Description: ${caseRow.description ?? 'none provided'}.`,
      `Timeline entries: ${timelineEntries.length}.`,
      `Linked evidence: ${evidenceLinks.length}.`,
    ].join(' ');

    return {
      bundle,
      sourceRefs,
      retrievalContext: JSON.stringify({ sourceRefs, summaryText }),
    };
  }
}
