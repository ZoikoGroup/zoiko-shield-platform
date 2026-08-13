import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import {
  requireEnvironmentId,
  requireRegion,
} from '../security/tenant-context';
import { randomUUID } from 'crypto';

export interface PromoteAlertResult {
  alertId: string;
  status: string;
  caseCandidatePayload: {
    tenantId: string;
    environmentId: string;
    title: string;
    description: string;
    severity: string;
    priority: string;
    sourceAlertIds: string[];
    affectedAssets: string[];
    affectedIdentities: string[];
  };
}

@Injectable()
export class AlertGeneratorService {
  private readonly logger = new Logger(AlertGeneratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
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
   * Promote alert into a Case candidate payload for Step 11 Case Management
   */
  async promoteAlertToCase(
    tenantId: string,
    alertId: string,
  ): Promise<PromoteAlertResult> {
    const alert = await this.getAlertById(tenantId, alertId);

    let sourceEventIds: string[] = [];
    let affectedAssets: string[] = [];
    let affectedIdentities: string[] = [];

    try {
      sourceEventIds = JSON.parse(alert.source_event_ids || '[]');
      affectedAssets = JSON.parse(alert.affected_assets || '[]');
      affectedIdentities = JSON.parse(alert.affected_identities || '[]');
    } catch (error) {
      throw new BadRequestException(
        `Alert '${alertId}' contains malformed context data: ${(error as Error).message}`,
      );
    }

    await this.prisma.alert.update({
      where: { id: alertId },
      data: { status: 'PROMOTED_TO_CASE' },
    });

    return {
      alertId: alert.id,
      status: 'PROMOTED_TO_CASE',
      caseCandidatePayload: {
        tenantId: alert.tenant_id,
        environmentId: alert.environment_id,
        title: `Case: ${alert.title}`,
        description:
          alert.description || `Investigating security alert ${alert.id}`,
        severity: alert.severity,
        priority: alert.priority,
        sourceAlertIds: [alert.id],
        affectedAssets,
        affectedIdentities,
      },
    };
  }
}
