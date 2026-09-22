import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import {
  requireEnvironmentId,
  requireRegion,
} from '../security/tenant-context';
import { randomUUID } from 'crypto';
import {
  AlertNotFoundError,
  ShieldCoreClient,
  ShieldCoreUnreachableError,
} from '../internal-client/shield-core.client';

export interface PromoteAlertResult {
  alertId: string;
  status: string;
  caseId: string;
  caseTitle: string;
  caseStatus: string;
}

@Injectable()
export class AlertGeneratorService {
  private readonly logger = new Logger(AlertGeneratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly shieldCore: ShieldCoreClient,
  ) {}

  /**
   * Creates a structured Alert from a MATCHED detection run.
   */
  async createAlertFromDetectionRun(detectionRunId: string) {
    const run = await this.prisma.detectionRun.findUnique({
      where: { id: detectionRunId },
      include: { rule: true },
    });

    if (!run) {
      throw new NotFoundException(`DetectionRun '${detectionRunId}' not found`);
    }

    if (run.result !== 'MATCHED') {
      return null;
    }

    // Check if an alert was already created for this detection run
    const existing = await this.prisma.alert.findFirst({
      where: {
        tenant_id: run.tenant_id,
        detection_match_id: run.id,
      },
    });

    if (existing) {
      this.logger.debug(
        `Alert already exists for detection run ${detectionRunId}`,
      );
      return existing;
    }

    const sourceEventIds = [run.event_id];
    const title = `Alert: ${run.rule?.name || 'Detection Match'}`;
    const description = `Security alert triggered by detection rule '${run.rule?.name || run.rule_id}' on event '${run.event_id}'`;

    const sourceEvent = await this.prisma.normalizedEvent.findFirst({
      where: { id: run.event_id, tenant_id: run.tenant_id },
      include: { rawEvent: true },
    });
    if (!sourceEvent) {
      throw new NotFoundException(
        `Normalized event '${run.event_id}' not found for detection run`,
      );
    }

    const alertId = randomUUID();
    const [alert] = await this.prisma.$transaction([
      this.prisma.alert.create({
        data: {
          id: alertId,
          tenant_id: run.tenant_id,
          environment_id: requireEnvironmentId(sourceEvent.environment_id),
          region: requireRegion(sourceEvent.rawEvent.source_region),
          detection_definition_id: run.rule_id,
          detection_version_id: run.rule_id,
          detection_match_id: run.id,
          title,
          description,
          severity: run.rule?.severity || 'HIGH',
          priority:
            run.rule?.severity === 'CRITICAL'
              ? 'P1'
              : run.rule?.severity === 'HIGH'
                ? 'P2'
                : 'P3',
          confidence: 0.9,
          status: 'NEW',
          source_event_ids: JSON.stringify(sourceEventIds),
        },
      }),
      this.prisma.outboxEvent.create({
        data: this.outbox.build({
          tenantId: run.tenant_id,
          topic: 'alert.created.v1',
          eventType: 'alert.created',
          payload: {
            alertId,
            detectionRunId: run.id,
            severity: run.rule?.severity || 'HIGH',
            environmentId: sourceEvent.environment_id,
            region: requireRegion(sourceEvent.rawEvent.source_region),
          },
        }),
      }),
    ]);

    this.logger.log(
      `Created Alert '${alert.id}' for tenant ${alert.tenant_id}`,
    );

    return alert;
  }

  /**
   * List alerts for a tenant with optional status/severity filtering
   */
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

  /**
   * Get single alert details
   */
  async getAlertById(tenantId: string, alertId: string) {
    const alert = await this.prisma.alert.findFirst({
      where: { id: alertId, tenant_id: tenantId },
    });

    if (!alert) {
      throw new NotFoundException(`Alert '${alertId}' not found`);
    }

    return alert;
  }

  /**
   * Update alert status
   */
  async updateAlertStatus(tenantId: string, alertId: string, status: string) {
    const validStatuses = [
      'NEW',
      'ACKNOWLEDGED',
      'INVESTIGATING',
      'SUPPRESSED',
      'FALSE_POSITIVE',
      'PROMOTED_TO_CASE',
      'CLOSED',
    ];

    if (!validStatuses.includes(status)) {
      throw new BadRequestException(`Invalid alert status '${status}'`);
    }

    await this.getAlertById(tenantId, alertId);

    return this.prisma.alert.update({
      where: { id: alertId },
      data: { status },
    });
  }

  /**
   * Assign alert to analyst
   */
  async assignAlert(tenantId: string, alertId: string, userId: string) {
    await this.getAlertById(tenantId, alertId);

    return this.prisma.alert.update({
      where: { id: alertId },
      data: {
        assigned_to: userId,
        status: 'INVESTIGATING',
      },
    });
  }

  /**
   * Promote an alert into a real case.
   *
   * This used to mark the alert 'PROMOTED_TO_CASE' and hand back a
   * "caseCandidatePayload" describing a case that was never created —
   * the caller got a 200 and an object that looked like a case, and no case
   * existed anywhere. It also wrote a status that is not in shield-core's
   * alert state machine at all, so the alert ended up in a state nothing
   * else could transition out of.
   *
   * Cases belong to shield-core (architecture spec §07), so promotion now
   * asks shield-core to open one. shield-core's CaseService is what moves
   * the alert to ESCALATED_TO_CASE, inside the same transaction that creates
   * the case — this method no longer touches the alert's status itself,
   * because doing so before the case existed is exactly what produced the
   * dangling state.
   */
  async promoteAlertToCase(
    tenantId: string,
    alertId: string,
    actorId?: string,
  ): Promise<PromoteAlertResult> {
    const alert = await this.getAlertById(tenantId, alertId);

    try {
      JSON.parse(alert.source_event_ids || '[]');
      JSON.parse(alert.affected_assets || '[]');
      JSON.parse(alert.affected_identities || '[]');
    } catch (error) {
      throw new BadRequestException(
        `Alert '${alertId}' contains malformed context data: ${(error as Error).message}`,
      );
    }

    let createdCase: { id: string; status: string; title: string };
    try {
      createdCase = await this.shieldCore.promoteAlertToCase({
        tenantId,
        alertId: alert.id,
        actorId,
      });
    } catch (error) {
      if (error instanceof AlertNotFoundError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof ShieldCoreUnreachableError) {
        // Deliberately not swallowed into a success response: if no case was
        // opened, the caller must find out now rather than from an empty
        // case queue later.
        throw new ServiceUnavailableException(
          `Alert '${alertId}' was not promoted: ${error.message}`,
        );
      }
      throw error;
    }

    const promoted = await this.getAlertById(tenantId, alertId);
    this.logger.log(
      `Alert ${alert.id} promoted to case ${createdCase.id} for tenant ${tenantId}`,
    );

    return {
      alertId: alert.id,
      status: promoted.status,
      caseId: createdCase.id,
      caseTitle: createdCase.title,
      caseStatus: createdCase.status,
    };
  }
}
