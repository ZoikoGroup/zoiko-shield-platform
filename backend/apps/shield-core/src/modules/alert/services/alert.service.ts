import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import {
  AlertStateMachineService,
  AlertStatus,
} from '../state-machine/alert-state-machine.service';
import { ALERT_TOPICS } from '../events/alert-events';

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly stateMachine: AlertStateMachineService,
  ) {}

  async getAlerts(
    tenantId: string,
    status?: string,
    severity?: string,
    limit = 50,
  ) {
    return this.prisma.alert.findMany({
      where: {
        tenant_id: tenantId,
        ...(status ? { status } : {}),
        ...(severity ? { severity } : {}),
      },
      take: limit,
      orderBy: { created_at: 'desc' },
    });
  }

  async getAlertById(tenantId: string, alertId: string) {
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
    });
    if (!alert || alert.tenant_id !== tenantId) {
      throw new NotFoundException(`Alert '${alertId}' not found`);
    }
    return alert;
  }

  /**
   * Everything W14 (Alert detail) needs to explain why an alert exists.
   *
   * The alert row on its own carries ids and a severity. It does not say which
   * rule fired, which version of it, what the rule actually observed, or what
   * context was resolved at the time — so an analyst looking at an alert had
   * no way to reach the reasoning behind it, and no way to disagree with it.
   * Everything assembled here was already being persisted; nothing read it.
   */
  async getAlertDetail(tenantId: string, alertId: string) {
    const alert = await this.getAlertById(tenantId, alertId);

    const [evaluation, definition, version, caseLink] = await Promise.all([
      // The detection match that produced this alert, with its factor
      // snapshot: the actual per-factor contributions the rule computed.
      this.prisma.detectionEvaluation.findFirst({
        where: { tenant_id: tenantId, id: alert.detection_match_id },
      }),
      alert.detection_definition_id
        ? this.prisma.detectionDefinition.findUnique({
            where: { id: alert.detection_definition_id },
          })
        : Promise.resolve(null),
      alert.detection_version_id
        ? this.prisma.detectionVersion.findUnique({
            where: { id: alert.detection_version_id },
          })
        : Promise.resolve(null),
      this.prisma.caseAlert.findFirst({
        where: { tenant_id: tenantId, alert_id: alertId },
        select: { case_id: true, relationship_type: true, linked_at: true },
      }),
    ]);

    const contextSnapshot = alert.context_snapshot_id
      ? await this.prisma.contextSnapshot.findFirst({
          where: { tenant_id: tenantId, id: alert.context_snapshot_id },
        })
      : null;

    const [identity, asset] = await Promise.all([
      alert.primary_identity_id
        ? this.prisma.identityEntity.findFirst({
            where: { tenant_id: tenantId, id: alert.primary_identity_id },
          })
        : Promise.resolve(null),
      alert.primary_asset_id
        ? this.prisma.asset.findFirst({
            where: { tenant_id: tenantId, id: alert.primary_asset_id },
          })
        : Promise.resolve(null),
    ]);

    const evidence = await this.prisma.evidenceRecord.findMany({
      where: { tenant_id: tenantId, source_object_id: alertId },
      orderBy: { created_at: 'asc' },
      select: {
        id: true,
        evidence_type: true,
        content_hash: true,
        integrity_state: true,
        created_at: true,
      },
    });

    return {
      alert,
      detection: {
        definitionKey: definition?.key ?? null,
        definitionName: definition?.name ?? null,
        category: definition?.category ?? null,
        versionNumber: version?.version ?? null,
        versionStatus: version?.status ?? null,
        // A rule with no published version behind it should be visible as
        // such rather than shown as an anonymous match.
        registered: Boolean(definition && version),
      },
      whyItFired: evaluation
        ? {
            result: evaluation.result,
            confidence: evaluation.confidence,
            // Per-factor contributions, including any the rule could not
            // determine. An INDETERMINATE factor is not a zero, and the
            // difference is what makes a disposition defensible.
            factors: JSON.parse(evaluation.factor_snapshot || '[]'),
            reasonCode: evaluation.reason_code,
            incompleteData: evaluation.incomplete_data,
            evaluatedAt: evaluation.evaluated_at,
            eventPayloadSnapshot: JSON.parse(
              evaluation.event_payload_snapshot || '{}',
            ),
          }
        : null,
      coverage: {
        state: alert.coverage_state,
        incompleteData: alert.incomplete_data,
        contextHealth: contextSnapshot?.context_health ?? 'UNRESOLVED',
      },
      context: contextSnapshot
        ? {
            identityRisk: contextSnapshot.identity_risk,
            assetCriticality: contextSnapshot.asset_criticality,
            resolverVersion: contextSnapshot.resolver_version,
            capturedAt: contextSnapshot.created_at,
          }
        : null,
      identity: identity
        ? {
            id: identity.id,
            email: identity.email,
            displayName: identity.display_name,
            identityType: identity.identity_type,
          }
        : null,
      asset: asset
        ? {
            id: asset.id,
            name: asset.name,
            assetType: asset.asset_type,
            criticality: asset.criticality,
          }
        : null,
      sourceEventIds: JSON.parse(alert.source_event_ids || '[]'),
      linkedCase: caseLink
        ? {
            caseId: caseLink.case_id,
            relationship: caseLink.relationship_type,
            linkedAt: caseLink.linked_at,
          }
        : null,
      evidence,
    };
  }

  /** Generic state transition, validated by AlertStateMachineService — never an open string write. */
  private async transition(
    tenantId: string,
    alertId: string,
    toState: AlertStatus,
    extraData: Record<string, unknown>,
    topic: string,
    eventType: string,
  ) {
    const alert = await this.getAlertById(tenantId, alertId);
    this.stateMachine.assertValidTransition(alert.status, toState);

    const [updated] = await this.prisma.$transaction([
      this.prisma.alert.update({
        where: { id: alertId },
        data: { status: toState, ...extraData },
      }),
      this.prisma.outboxEvent.create({
        data: this.outbox.build({
          tenantId,
          topic,
          eventType,
          payload: { alertId, fromStatus: alert.status, toStatus: toState },
        }),
      }),
    ]);

    return updated;
  }

  async acknowledge(tenantId: string, alertId: string) {
    return this.transition(
      tenantId,
      alertId,
      'ACKNOWLEDGED',
      { acknowledged_at: new Date() },
      ALERT_TOPICS.ALERT_ACKNOWLEDGED,
      'alert.acknowledged',
    );
  }

  async triage(tenantId: string, alertId: string) {
    return this.transition(
      tenantId,
      alertId,
      'TRIAGED',
      {},
      ALERT_TOPICS.ALERT_TRIAGED,
      'alert.triaged',
    );
  }

  /** Flips the Alert to ESCALATED_TO_CASE — the actual Case row is created synchronously by shield-core's case-management module reading this same Alert via the shared schema, not by this method. */
  async escalate(tenantId: string, alertId: string) {
    return this.transition(
      tenantId,
      alertId,
      'ESCALATED_TO_CASE',
      {},
      ALERT_TOPICS.ALERT_ESCALATED,
      'alert.escalated',
    );
  }

  async close(tenantId: string, alertId: string, disposition?: AlertStatus) {
    const target: AlertStatus = disposition ?? 'CLOSED';
    if (target !== 'CLOSED') {
      // e.g. FALSE_POSITIVE/DUPLICATE recorded first, then closed as a
      // separate explicit step — never inferred.
      await this.transition(
        tenantId,
        alertId,
        target,
        {},
        ALERT_TOPICS.ALERT_TRIAGED,
        `alert.${target.toLowerCase()}`,
      );
    }
    return this.transition(
      tenantId,
      alertId,
      'CLOSED',
      { resolved_at: new Date() },
      ALERT_TOPICS.ALERT_TRIAGED,
      'alert.closed',
    );
  }

  async updateStatus(tenantId: string, alertId: string, status: string) {
    return this.transition(
      tenantId,
      alertId,
      status as AlertStatus,
      {},
      ALERT_TOPICS.ALERT_TRIAGED,
      'alert.status.changed',
    );
  }
}
