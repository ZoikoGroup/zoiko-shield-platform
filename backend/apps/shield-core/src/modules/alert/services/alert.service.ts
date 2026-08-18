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
