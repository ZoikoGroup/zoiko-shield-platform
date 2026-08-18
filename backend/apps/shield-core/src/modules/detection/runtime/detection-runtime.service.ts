import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  KafkaProducerService,
  CANONICAL_TOPICS,
} from '../../../kafka/kafka-producer.service';
import { DetectionRegistryService } from '../registry/detection-registry.service';
import { DetectionInput } from './detection-rule.interface';
import { AlertCreationService } from '../../alert/services/alert-creation.service';
import {
  NormalizedEventContract,
  ResolvedContext,
} from '../../security-context/context/context.types';

/**
 * Dispatches to registered DetectionRule implementations (spec §17/§31),
 * persisting DetectionEvaluation (always) plus DetectionMatch (only on
 * MATCH, upserted on the spec §36 dedup key so redelivery never creates
 * duplicates). Driven entirely by the event.normalized.v1 payload plus the
 * ContextResolutionService result threaded in by the Kafka consumer
 * handler — never re-queries the shield-ingest-owned NormalizedEvent
 * table. Identity/Asset lookups by id are shield-core's own tables.
 */
@Injectable()
export class DetectionRuntimeService {
  private readonly logger = new Logger(DetectionRuntimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: DetectionRegistryService,
    private readonly kafkaProducer: KafkaProducerService,
    private readonly alertCreationService: AlertCreationService,
  ) {}

  async evaluateFromEvent(
    payload: NormalizedEventContract,
    resolved: ResolvedContext,
  ): Promise<void> {
    const [identity, asset] = await Promise.all([
      resolved.identityEntityId
        ? this.prisma.identityEntity.findUnique({
            where: { id: resolved.identityEntityId },
          })
        : Promise.resolve(null),
      resolved.assetId
        ? this.prisma.asset.findUnique({ where: { id: resolved.assetId } })
        : Promise.resolve(null),
    ]);

    const applicableVersions = await this.registry.findApplicable(
      payload.tenantId,
      payload.eventClass,
    );
    const correlationId = payload.correlationId ?? randomUUID();

    for (const version of applicableVersions) {
      const rule = this.registry.getRuleImplementation(
        version.detectionDefinition.key,
      );

      const input: DetectionInput = {
        tenantId: payload.tenantId,
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
        identity: identity
          ? {
              id: identity.id,
              status: identity.status,
              identity_type: identity.identity_type,
            }
          : null,
        asset: asset
          ? {
              id: asset.id,
              criticality: asset.criticality,
              status: asset.status,
            }
          : null,
        contextHealth: resolved.contextHealth,
        configuration: JSON.parse(version.configuration || '{}'),
      };

      const outcome = await rule.evaluate(input);

      const evaluation = await this.prisma.detectionEvaluation.create({
        data: {
          tenant_id: payload.tenantId,
          environment_id: payload.environmentId,
          detection_version_id: version.id,
          event_id: payload.normalizedEventId,
          context_snapshot_id: resolved.contextSnapshotId,
          result: outcome.result,
          factor_snapshot: JSON.stringify(outcome.factors),
          confidence: outcome.confidence,
          incomplete_data: outcome.incompleteData,
          reason_code: outcome.reasons[0],
          correlation_id: correlationId,
          event_payload_snapshot: JSON.stringify(payload),
        },
      });

      if (outcome.result === 'MATCH') {
        await this.persistMatch(
          payload,
          resolved,
          version,
          evaluation.id,
          outcome,
          correlationId,
        );
      } else if (outcome.result === 'INDETERMINATE') {
        await this.kafkaProducer.publishEvent(
          CANONICAL_TOPICS.DETECTION_INDETERMINATE,
          'detection.indeterminate',
          {
            tenantId: payload.tenantId,
            detectionDefinitionKey: version.detectionDefinition.key,
            eventId: payload.normalizedEventId,
            reasons: outcome.reasons,
          },
          { correlationId },
        );
      }
    }
  }

  private async persistMatch(
    payload: NormalizedEventContract,
    resolved: ResolvedContext,
    version: {
      id: string;
      detection_definition_id: string;
      severity: string;
      detectionDefinition: { key: string; name: string };
    },
    evaluationId: string,
    outcome: {
      confidence?: number;
      factors: unknown[];
      incompleteData: boolean;
    },
    correlationId: string,
  ) {
    const match = await this.prisma.detectionMatch.upsert({
      where: {
        tenant_id_detection_version_id_primary_event_id_context_snapshot_id: {
          tenant_id: payload.tenantId,
          detection_version_id: version.id,
          primary_event_id: payload.normalizedEventId,
          context_snapshot_id: resolved.contextSnapshotId ?? null,
        } as any,
      },
      update: {},
      create: {
        tenant_id: payload.tenantId,
        environment_id: payload.environmentId,
        detection_definition_id: version.detection_definition_id,
        detection_version_id: version.id,
        primary_event_id: payload.normalizedEventId,
        supporting_event_refs: '[]',
        context_snapshot_id: resolved.contextSnapshotId,
        severity: version.severity,
        confidence: outcome.confidence,
        factor_contributions: JSON.stringify(outcome.factors),
        incomplete_data: outcome.incompleteData,
        occurred_at: payload.occurredAt
          ? new Date(payload.occurredAt)
          : new Date(),
        correlation_id: correlationId,
      },
    });

    this.logger.log(
      `Detection MATCH: evaluation=${evaluationId} match=${match.id} tenant=${payload.tenantId}`,
    );

    await this.kafkaProducer.publishEvent(
      CANONICAL_TOPICS.DETECTION_MATCHED,
      'detection.matched',
      {
        tenantId: payload.tenantId,
        detectionMatchId: match.id,
        detectionDefinitionId: version.detection_definition_id,
        detectionVersionId: version.id,
        severity: version.severity,
        primaryEventId: payload.normalizedEventId,
      },
      { correlationId },
    );

    await this.alertCreationService.createFromMatch({
      tenantId: payload.tenantId,
      environmentId: payload.environmentId,
      region: payload.region,
      detectionDefinitionId: version.detection_definition_id,
      detectionVersionId: version.id,
      detectionMatchId: match.id,
      primaryEventId: payload.normalizedEventId,
      contextSnapshotId: resolved.contextSnapshotId,
      identityEntityId: resolved.identityEntityId,
      assetId: resolved.assetId,
      severity: version.severity,
      confidence: outcome.confidence,
      incompleteData: outcome.incompleteData,
      correlationId,
      title: `${version.detectionDefinition.name}`,
      description: `Detection '${version.detectionDefinition.key}' matched on event ${payload.normalizedEventId}`,
    });
  }
}
