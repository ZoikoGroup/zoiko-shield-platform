import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { AlertSuppressionService } from '../suppression/alert-suppression.service';
import { AlertRepository } from '../repositories/alert.repository';
import { ALERT_TOPICS } from '../events/alert-events';
import { randomUUID } from 'crypto';
import { requireRegion } from '../../../tenant-context';

export interface CreateAlertFromMatchInput {
  tenantId: string;
  environmentId: string;
  region: string;
  detectionDefinitionId: string;
  detectionVersionId: string;
  detectionMatchId: string;
  primaryEventId: string;
  contextSnapshotId?: string;
  identityEntityId?: string;
  assetId?: string;
  severity: string;
  confidence?: number;
  incompleteData: boolean;
  correlationId: string;
  title: string;
  description?: string;
}

/**
 * Detection Match -> Alert (spec §4). Called in-process from
 * DetectionRuntimeService.persistMatch right after the DetectionMatch is
 * upserted — no Kafka consumer needed for this hop since both live in the
 * same app. Dedups on the Alert(tenant_id, detection_match_id) unique
 * constraint (spec §5): at-least-once redelivery of the same match never
 * produces a second Alert. Suppression (spec §6) is evaluated before
 * creation — a suppressed detection still gets a recorded outcome, it is
 * never silently dropped.
 */
@Injectable()
export class AlertCreationService {
  private readonly logger = new Logger(AlertCreationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly suppression: AlertSuppressionService,
    private readonly alertRepository: AlertRepository,
  ) {}

  async createFromMatch(input: CreateAlertFromMatchInput): Promise<{ alertId: string; suppressed: boolean }> {
    const existing = await this.alertRepository.findByDetectionMatch(input.tenantId, input.detectionMatchId);
    if (existing) {
      this.logger.debug(`Alert already exists for detection match ${input.detectionMatchId} — dedup, not creating a second Alert.`);
      return { alertId: existing.id, suppressed: existing.status === 'SUPPRESSED' };
    }

    const suppressionMatch = await this.suppression.findActiveMatch({
      tenantId: input.tenantId,
      detectionDefinitionId: input.detectionDefinitionId,
      identityId: input.identityEntityId,
      assetId: input.assetId,
    });

    const priority = input.severity === 'CRITICAL' ? 'P1' : input.severity === 'HIGH' ? 'P2' : 'P3';
    const alertId = randomUUID();

    const [alert] = await this.prisma.$transaction([
      this.prisma.alert.create({
        data: {
          id: alertId,
          tenant_id: input.tenantId,
          environment_id: input.environmentId,
          region: requireRegion(input.region),
          detection_definition_id: input.detectionDefinitionId,
          detection_version_id: input.detectionVersionId,
          detection_match_id: input.detectionMatchId,
          title: input.title,
          description: input.description,
          severity: input.severity,
          priority,
          confidence: input.confidence ?? 0.9,
          status: suppressionMatch ? 'SUPPRESSED' : 'NEW',
          source_event_ids: JSON.stringify([input.primaryEventId]),
          affected_assets: JSON.stringify(input.assetId ? [input.assetId] : []),
          affected_identities: JSON.stringify(input.identityEntityId ? [input.identityEntityId] : []),
          primary_identity_id: input.identityEntityId,
          primary_asset_id: input.assetId,
          context_snapshot_id: input.contextSnapshotId,
          incomplete_data: input.incompleteData,
          coverage_state: input.incompleteData ? 'PARTIAL' : 'FULL',
          correlation_id: input.correlationId,
          created_by: 'detection-runtime',
        },
      }),
      this.prisma.outboxEvent.create({
        data: this.outbox.build({
          tenantId: input.tenantId,
          topic: suppressionMatch ? ALERT_TOPICS.ALERT_SUPPRESSED : ALERT_TOPICS.ALERT_CREATED,
          eventType: suppressionMatch ? 'alert.suppressed' : 'alert.created',
          payload: {
            alertId,
            detectionMatchId: input.detectionMatchId,
            severity: input.severity,
            suppressionRuleId: suppressionMatch?.id,
            environmentId: input.environmentId,
            region: requireRegion(input.region),
          },
          correlationId: input.correlationId,
        }),
      }),
    ]);

    if (suppressionMatch) {
      this.logger.log(`Alert ${alert.id} created but SUPPRESSED by rule ${suppressionMatch.id}: ${suppressionMatch.reason}`);
    } else {
      this.logger.log(`Alert ${alert.id} created from detection match ${input.detectionMatchId}`);
    }

    return { alertId: alert.id, suppressed: !!suppressionMatch };
  }
}
