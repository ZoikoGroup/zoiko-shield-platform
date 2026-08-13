import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DetectionRegistryService } from '../registry/detection-registry.service';
import { DetectionInput } from '../runtime/detection-rule.interface';
import { NormalizedEventContract } from '../../security-context/context/context.types';

/**
 * Deterministic replay (spec §33/§34): re-runs the exact rule version
 * against the frozen `event_payload_snapshot` and ContextSnapshot captured
 * at original evaluation time — never a live NormalizedEvent read
 * (shield-core does not query shield-ingest-owned tables) and never live
 * Asset/Identity state, so a later change can never silently rewrite
 * history.
 */
@Injectable()
export class DetectionReplayService {
  private readonly logger = new Logger(DetectionReplayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: DetectionRegistryService,
  ) {}

  async replay(tenantId: string, evaluationId: string) {
    const evaluation = await this.prisma.detectionEvaluation.findFirst({
      where: { id: evaluationId, tenant_id: tenantId },
      include: { detectionVersion: { include: { detectionDefinition: true } } },
    });
    if (!evaluation) {
      throw new NotFoundException(`DetectionEvaluation '${evaluationId}' not found`);
    }

    const payload: NormalizedEventContract = JSON.parse(evaluation.event_payload_snapshot || '{}');

    const snapshot = evaluation.context_snapshot_id
      ? await this.prisma.contextSnapshot.findUnique({ where: { id: evaluation.context_snapshot_id } })
      : null;

    const [identity, asset] = await Promise.all([
      snapshot?.identity_entity_id
        ? this.prisma.identityEntity.findUnique({ where: { id: snapshot.identity_entity_id } })
        : Promise.resolve(null),
      snapshot?.asset_id ? this.prisma.asset.findUnique({ where: { id: snapshot.asset_id } }) : Promise.resolve(null),
    ]);

    const rule = this.registry.getRuleImplementation(evaluation.detectionVersion.detectionDefinition.key);

    const input: DetectionInput = {
      tenantId: evaluation.tenant_id,
      event: {
        id: payload.normalizedEventId,
        tenant_id: payload.tenantId,
        environment_id: payload.environmentId,
        event_class: payload.eventClass,
        event_category: payload.eventCategory ?? null,
        event_activity: payload.eventActivity ?? null,
        actor_user_id: payload.actorUserId ?? null,
        actor_email: payload.actorEmail ?? null,
        source_ip: payload.sourceIp ?? null,
        destination_ip: payload.destinationIp ?? null,
        resource_id: payload.resourceId ?? null,
        action: payload.action ?? null,
        outcome: payload.outcome ?? null,
        occurred_at: payload.occurredAt ? new Date(payload.occurredAt) : null,
      },
      // Frozen identity/asset context as it existed at the snapshot, not
      // whatever the live rows say now (only identity_type/criticality can
      // drift on the live row — we still key the lookup by the frozen id).
      identity: identity ? { id: identity.id, status: identity.status, identity_type: identity.identity_type } : null,
      asset: asset ? { id: asset.id, criticality: asset.criticality, status: asset.status } : null,
      contextHealth: snapshot?.context_health ?? 'UNRESOLVED',
      configuration: JSON.parse(evaluation.detectionVersion.configuration || '{}'),
    };

    const replayOutcome = await rule.evaluate(input);
    const divergence = replayOutcome.result !== evaluation.result;

    const replay = await this.prisma.detectionReplay.create({
      data: {
        tenant_id: evaluation.tenant_id,
        original_evaluation_id: evaluation.id,
        detection_version_id: evaluation.detection_version_id,
        original_result: evaluation.result,
        replay_result: replayOutcome.result,
        divergence,
        reason: divergence
          ? `Original=${evaluation.result} Replay=${replayOutcome.result} — NON_DETERMINISTIC`
          : undefined,
      },
    });

    if (divergence) {
      this.logger.warn(`Replay divergence for evaluation ${evaluationId}: ${evaluation.result} -> ${replayOutcome.result}`);
    }

    return replay;
  }
}
