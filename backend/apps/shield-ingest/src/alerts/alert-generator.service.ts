import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaProducerService } from '../kafka/kafka.producer.service';

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
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  /**
   * Creates a structured Alert from a MATCHED detection run.
   */
  async createAlertFromDetectionRun(detectionRunId: string) {
    const run = await this.prisma.detectionRun.findUnique({
      where: { id: detectionRunId },
      include: { rule: true, event: true },
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
        detection_rule_id: run.rule_id,
        detection_rule_version: run.rule_version,
        source_event_ids: { contains: run.event_id },
      },
    });

    if (existing) {
      this.logger.debug(`Alert already exists for detection run ${detectionRunId}`);
      return existing;
    }

    // Extract affected assets and identities from event
    const sourceEventIds = [run.event_id];
    const affectedAssets = run.event.resource_id ? [run.event.resource_id] : [];
    const affectedIdentities = run.event.actor_email
      ? [run.event.actor_email]
      : run.event.actor_user_id
      ? [run.event.actor_user_id]
      : [];

    const title = `Alert: ${run.rule.name}`;
    const description = `Security alert triggered by detection rule '${run.rule.name}' on event '${run.event_id}'`;

    const alert = await this.prisma.alert.create({
      data: {
        tenant_id: run.tenant_id,
        environment_id: run.event.environment_id || 'default-env',
        detection_rule_id: run.rule_id,
        detection_rule_version: run.rule_version,
        title,
        description,
        severity: run.rule.severity || 'HIGH',
        priority: run.rule.severity === 'CRITICAL' ? 'P1' : run.rule.severity === 'HIGH' ? 'P2' : 'P3',
        confidence: 0.9,
        status: 'NEW',
        source_event_ids: JSON.stringify(sourceEventIds),
        affected_assets: JSON.stringify(affectedAssets),
        affected_identities: JSON.stringify(affectedIdentities),
      },
    });

    this.logger.log(`Created Alert '${alert.id}' for tenant ${alert.tenant_id}`);

    // Emit Kafka event
    try {
      await this.kafkaProducer.emit('alert.published', {
        alertId: alert.id,
        tenantId: alert.tenant_id,
        severity: alert.severity,
        title: alert.title,
      });
    } catch (err) {
      this.logger.warn(`Failed to emit alert.published: ${err}`);
    }

    return alert;
  }

  /**
   * List alerts for a tenant with optional status/severity filtering
   */
  async getAlerts(tenantId: string, status?: string, severity?: string, limit = 50) {
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
  async getAlertById(alertId: string) {
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
    });

    if (!alert) {
      throw new NotFoundException(`Alert '${alertId}' not found`);
    }

    return alert;
  }

  /**
   * Update alert status
   */
  async updateAlertStatus(alertId: string, status: string) {
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

    await this.getAlertById(alertId);

    return this.prisma.alert.update({
      where: { id: alertId },
      data: { status },
    });
  }

  /**
   * Assign alert to analyst
   */
  async assignAlert(alertId: string, userId: string) {
    await this.getAlertById(alertId);

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
  async promoteAlertToCase(alertId: string): Promise<PromoteAlertResult> {
    const alert = await this.getAlertById(alertId);

    await this.prisma.alert.update({
      where: { id: alertId },
      data: { status: 'PROMOTED_TO_CASE' },
    });

    let sourceEventIds: string[] = [];
    let affectedAssets: string[] = [];
    let affectedIdentities: string[] = [];

    try {
      sourceEventIds = JSON.parse(alert.source_event_ids || '[]');
      affectedAssets = JSON.parse(alert.affected_assets || '[]');
      affectedIdentities = JSON.parse(alert.affected_identities || '[]');
    } catch {}

    return {
      alertId: alert.id,
      status: 'PROMOTED_TO_CASE',
      caseCandidatePayload: {
        tenantId: alert.tenant_id,
        environmentId: alert.environment_id,
        title: `Case: ${alert.title}`,
        description: alert.description || `Investigating security alert ${alert.id}`,
        severity: alert.severity,
        priority: alert.priority,
        sourceAlertIds: [alert.id],
        affectedAssets,
        affectedIdentities,
      },
    };
  }
}
