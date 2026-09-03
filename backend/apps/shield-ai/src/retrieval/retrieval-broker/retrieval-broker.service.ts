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
 * Builds a Multi-Dimensional RetrievalBundle by calling shield-core's internal APIs (spec §8-§9).
 * Seamlessly integrates all 8 security dimensions:
 * 1. Case Metadata
 * 2. Case Timeline
 * 3. Evidence Ledger
 * 4. Detection Matches
 * 5. Execution Context Snapshots
 * 6. Identity Entities
 * 7. Asset Inventory
 * 8. Connector Health
 */
@Injectable()
export class RetrievalBrokerService {
  private readonly logger = new Logger(RetrievalBrokerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shieldCoreClient: ShieldCoreClient,
  ) {}

  async build(input: BuildBundleInput) {
    const [
      caseRes,
      timelineRes,
      evidenceRes,
      detectionsRes,
      contextRes,
      entitiesRes,
      assetsRes,
      connectorsRes,
    ] = await Promise.allSettled([
      this.shieldCoreClient.getCase(input.tenantId, input.caseId),
      this.shieldCoreClient.getCaseTimeline(input.tenantId, input.caseId),
      this.shieldCoreClient.getCaseEvidence(input.tenantId, input.caseId),
      this.shieldCoreClient.getCaseDetections(input.tenantId, input.caseId),
      this.shieldCoreClient.getCaseContextSnapshot(input.tenantId, input.caseId),
      this.shieldCoreClient.getCaseEntities(input.tenantId, input.caseId),
      this.shieldCoreClient.getCaseAssets(input.tenantId, input.caseId),
      this.shieldCoreClient.getCaseConnectorsHealth(input.tenantId, input.caseId),
    ]);

    const caseRow = caseRes.status === 'fulfilled' ? caseRes.value?.data : null;
    if (!caseRow) {
      throw new Error(`Failed to retrieve case ${input.caseId} from shield-core`);
    }

    const timelineEntries: any[] = timelineRes.status === 'fulfilled' ? timelineRes.value?.data ?? [] : [];
    const evidenceLinks: any[] = evidenceRes.status === 'fulfilled' ? evidenceRes.value?.data ?? [] : [];
    const detections: any[] = detectionsRes.status === 'fulfilled' ? detectionsRes.value?.data ?? [] : [];
    const contextSnapshot: any = contextRes.status === 'fulfilled' ? contextRes.value?.data ?? null : null;
    const entities: any[] = entitiesRes.status === 'fulfilled' ? entitiesRes.value?.data ?? [] : [];
    const assets: any[] = assetsRes.status === 'fulfilled' ? assetsRes.value?.data ?? [] : [];
    const connectors: any[] = connectorsRes.status === 'fulfilled' ? connectorsRes.value?.data ?? [] : [];

    const sourceRefs: string[] = [
      `case:${caseRow.id}`,
      ...timelineEntries.map((e) => `timeline:${e.id}`),
      ...evidenceLinks.map((e) => `evidence:${e.evidence_id}`),
      ...detections.map((d) => `detection:${d.id}`),
      ...(contextSnapshot ? [`context:snapshot-${caseRow.id}`] : []),
      ...entities.map((ent) => `identity:${ent.id}`),
      ...assets.map((ast) => `asset:${ast.assetId}`),
      ...connectors.map((c) => `connector:${c.id}`),
    ];
    const evidenceRefs = evidenceLinks.map((e) => e.evidence_id);

    const isFullyPopulated =
      evidenceLinks.length > 0 &&
      detections.length > 0 &&
      entities.length > 0 &&
      assets.length > 0;
    const completenessState = isFullyPopulated ? 'COMPLETE' : 'PARTIAL';
    const freshnessState = 'CURRENT';

    const bundle = await this.prisma.retrievalBundle.create({
      data: {
        tenant_id: input.tenantId,
        environment_id: input.environmentId,
        purpose: input.purpose,
        case_id: input.caseId,
        source_refs: JSON.stringify(sourceRefs),
        evidence_refs: JSON.stringify(evidenceRefs),
        source_versions: JSON.stringify({
          case: caseRow.updated_at ?? null,
          contextCapturedAt: contextSnapshot?.capturedAt ?? null,
        }),
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
      `Detection matches: ${detections.length}.`,
      `Entities involved: ${entities.length} (${entities.map((e) => e.email || e.id).join(', ') || 'none'}).`,
      `Assets involved: ${assets.length} (${assets.map((a) => a.hostname || a.assetId).join(', ') || 'none'}).`,
      `Active connectors: ${connectors.length} (${connectors.map((c) => `${c.name}:${c.state}`).join(', ') || 'none'}).`,
    ].join(' ');

    const retrievalContext = JSON.stringify({
      sourceRefs,
      summaryText,
      case: caseRow,
      detections,
      contextSnapshot,
      entities,
      assets,
      connectors,
    });

    return {
      bundle,
      sourceRefs,
      retrievalContext,
    };
  }
}
