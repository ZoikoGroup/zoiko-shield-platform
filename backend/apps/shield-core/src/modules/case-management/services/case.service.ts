import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { CaseRepository } from '../repositories/case.repository';
import {
  CaseStateMachineService,
  CaseStatus,
  CaseDisposition,
} from '../state-machine/case-state-machine.service';
import { CaseTimelineService } from '../timeline/case-timeline.service';
import { EvidenceService } from '../../evidence/services/evidence.service';
import { EvidenceAutoCreationService } from '../../evidence/evidence-auto-creation.service';
import { CASE_TOPICS } from '../events/case-events';

@Injectable()
export class CaseService {
  private readonly logger = new Logger(CaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly caseRepository: CaseRepository,
    private readonly stateMachine: CaseStateMachineService,
    private readonly timeline: CaseTimelineService,
    private readonly evidenceService: EvidenceService,
    private readonly evidenceAutoCreation: EvidenceAutoCreationService,
  ) {}

  /**
   * Alert -> Case escalation (spec §9). Reads the Alert directly via
   * Prisma — same shared schema shield-ingest writes to — rather than
   * requiring the Alert's full payload to be replayed over Kafka.
   */
  async createFromAlert(params: {
    tenantId: string;
    environmentId?: string;
    alertId: string;
    actorId: string;
    title?: string;
    description?: string;
  }) {
    const alert = await this.caseRepository.findAlertByTenantAndId(
      params.tenantId,
      params.alertId,
    );
    if (!alert) {
      throw new NotFoundException(
        `Alert '${params.alertId}' not found for this tenant`,
      );
    }

    const caseId = randomUUID();
    const correlationId = randomUUID();

    const [createdCase] = await this.prisma.$transaction([
      this.prisma.case.create({
        data: {
          id: caseId,
          tenant_id: params.tenantId,
          environment_id: params.environmentId ?? alert.environment_id,
          region: alert.region,
          title: params.title ?? `Case: ${alert.title}`,
          description:
            params.description ??
            alert.description ??
            `Escalated from alert ${alert.id}`,
          severity: alert.severity,
          priority: alert.priority,
          status: 'NEW',
          primary_identity_id: alert.primary_identity_id,
          primary_asset_id: alert.primary_asset_id,
          correlation_id: correlationId,
          created_by: params.actorId,
        },
      }),
      this.prisma.caseAlert.create({
        data: {
          tenant_id: params.tenantId,
          case_id: caseId,
          alert_id: alert.id,
          linked_by: params.actorId,
          relationship_type: 'PRIMARY',
        },
      }),
      this.prisma.outboxEvent.create({
        data: this.outbox.build({
          tenantId: params.tenantId,
          topic: CASE_TOPICS.CASE_CREATED,
          eventType: 'case.created',
          payload: { caseId, alertId: alert.id },
          correlationId,
        }),
      }),
    ]);

    await this.timeline.append({
      tenantId: params.tenantId,
      caseId,
      entryType: 'CASE_CREATED',
      actorId: params.actorId,
      title: 'Case created',
      summary: `Escalated from alert ${alert.id}`,
      correlationId,
    });
    await this.timeline.append({
      tenantId: params.tenantId,
      caseId,
      entryType: 'ALERT_LINKED',
      actorId: params.actorId,
      title: 'Alert linked',
      summary: `Alert ${alert.id} linked as PRIMARY`,
      sourceRef: alert.id,
      correlationId,
    });

    const sourceEvidence = await this.evidenceService.createEvidence({
      tenantId: params.tenantId,
      environmentId: params.environmentId ?? alert.environment_id,
      region: alert.region,
      evidenceType: 'ALERT_ESCALATION',
      producingService: 'case-management',
      sourceSystemId: 'shield-ingest-alert-service',
      sourceObjectId: alert.id,
      purpose: 'INVESTIGATION',
      content: {
        alertId: alert.id,
        detectionMatchId: alert.detection_match_id,
        caseId,
      },
    });

    await this.prisma.caseEvidence.create({
      data: {
        tenant_id: params.tenantId,
        case_id: caseId,
        evidence_id: sourceEvidence.id,
        relationship: 'SOURCE',
        added_by: params.actorId,
      },
    });

    this.logger.log(
      `Case ${createdCase.id} created from alert ${alert.id} for tenant ${params.tenantId}`,
    );
    return createdCase;
  }

  async getById(tenantId: string, caseId: string) {
    const caseRow = await this.caseRepository.findByTenantAndId(
      tenantId,
      caseId,
    );
    if (!caseRow) {
      throw new NotFoundException(`Case '${caseId}' not found`);
    }
    return caseRow;
  }

  async assertTenantOwnership(tenantId: string, caseId: string) {
    const caseRow = await this.prisma.case.findUnique({
      where: { id: caseId },
    });
    if (!caseRow) {
      throw new NotFoundException(`Case '${caseId}' not found`);
    }
    if (caseRow.tenant_id !== tenantId) {
      throw new ForbiddenException(
        `Case '${caseId}' does not belong to this tenant`,
      );
    }
    return caseRow;
  }

  async getEvidenceLinks(tenantId: string, caseId: string) {
    return this.prisma.caseEvidence.findMany({
      where: { tenant_id: tenantId, case_id: caseId },
      include: { evidence: true },
      orderBy: { added_at: 'asc' },
    });
  }

  async list(tenantId: string, status?: string, limit = 50) {
    return this.prisma.case.findMany({
      where: { tenant_id: tenantId, ...(status ? { status } : {}) },
      take: limit,
      orderBy: { created_at: 'desc' },
    });
  }

  async transition(params: {
    tenantId: string;
    caseId: string;
    toState: CaseStatus;
    actorId: string;
    reason: string;
    disposition?: CaseDisposition;
  }) {
    const caseRow = await this.getById(params.tenantId, params.caseId);
    this.stateMachine.assertValidTransition(caseRow.status, params.toState);

    const extra: Record<string, unknown> = {};
    if (params.toState === 'RESOLVED') extra.resolved_at = new Date();
    if (params.toState === 'CLOSED') extra.closed_at = new Date();
    if (params.disposition) extra.disposition = params.disposition;

    const [, transition] = await this.prisma.$transaction([
      this.prisma.case.update({
        where: { id: params.caseId },
        data: { status: params.toState, ...extra },
      }),
      this.prisma.caseTransition.create({
        data: {
          tenant_id: params.tenantId,
          case_id: params.caseId,
          from_state: caseRow.status,
          to_state: params.toState,
          actor_id: params.actorId,
          reason: params.reason,
        },
      }),
      this.prisma.outboxEvent.create({
        data: this.outbox.build({
          tenantId: params.tenantId,
          topic: CASE_TOPICS.CASE_STATE_CHANGED,
          eventType: 'case.state.changed',
          payload: {
            caseId: params.caseId,
            fromState: caseRow.status,
            toState: params.toState,
          },
        }),
      }),
    ]);

    await this.timeline.append({
      tenantId: params.tenantId,
      caseId: params.caseId,
      entryType: 'STATUS_CHANGED',
      actorId: params.actorId,
      title: `Status changed: ${caseRow.status} -> ${params.toState}`,
      summary: params.reason,
    });

    await this.evidenceAutoCreation.createForCaseTransition({
      tenantId: params.tenantId,
      environmentId: caseRow.environment_id,
      region: caseRow.region,
      caseId: params.caseId,
      fromState: caseRow.status,
      toState: params.toState,
      actorId: params.actorId,
      reason: params.reason,
    });

    return transition;
  }

  async linkAlert(params: {
    tenantId: string;
    caseId: string;
    alertId: string;
    actorId: string;
    relationshipType?: string;
  }) {
    await this.getById(params.tenantId, params.caseId);
    const alert = await this.caseRepository.findAlertByTenantAndId(
      params.tenantId,
      params.alertId,
    );
    if (!alert) {
      throw new NotFoundException(
        `Alert '${params.alertId}' not found for this tenant`,
      );
    }

    const link = await this.prisma.caseAlert.create({
      data: {
        tenant_id: params.tenantId,
        case_id: params.caseId,
        alert_id: params.alertId,
        linked_by: params.actorId,
        relationship_type: params.relationshipType ?? 'RELATED',
      },
    });

    await this.timeline.append({
      tenantId: params.tenantId,
      caseId: params.caseId,
      entryType: 'ALERT_LINKED',
      actorId: params.actorId,
      title: 'Alert linked',
      summary: `Alert ${params.alertId} linked as ${params.relationshipType ?? 'RELATED'}`,
      sourceRef: params.alertId,
    });

    return link;
  }
}
