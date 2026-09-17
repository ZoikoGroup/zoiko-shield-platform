import {
  ConflictException,
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
import { SocSlaClockService } from '../../sla/soc-sla-clock.service';
import { CaseQualityReviewService } from '../quality/case-quality-review.service';
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
    private readonly slaClock: SocSlaClockService,
    private readonly qualityReview: CaseQualityReviewService,
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
          queue_id: 'DEFAULT',
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

  /**
   * Create a bare case with no alert to escalate from (spec parity gap:
   * this controller previously could only create cases via createFromAlert).
   */
  async createStandalone(params: {
    tenantId: string;
    environmentId: string;
    region: string;
    title: string;
    description?: string;
    severity?: string;
    priority?: string;
    actorId: string;
  }) {
    const caseId = randomUUID();

    const [createdCase] = await this.prisma.$transaction([
      this.prisma.case.create({
        data: {
          id: caseId,
          tenant_id: params.tenantId,
          environment_id: params.environmentId,
          region: params.region,
          title: params.title,
          description: params.description,
          severity: params.severity ?? 'HIGH',
          priority: params.priority ?? 'P2',
          status: 'NEW',
          queue_id: 'DEFAULT',
          created_by: params.actorId,
        },
      }),
      this.prisma.outboxEvent.create({
        data: this.outbox.build({
          tenantId: params.tenantId,
          topic: CASE_TOPICS.CASE_CREATED,
          eventType: 'case.created',
          payload: { caseId },
        }),
      }),
    ]);

    await this.timeline.append({
      tenantId: params.tenantId,
      caseId,
      entryType: 'CASE_CREATED',
      actorId: params.actorId,
      title: 'Case created',
      summary: `Case '${params.title}' created in NEW state`,
    });

    this.logger.log(
      `Standalone case ${createdCase.id} created for tenant ${params.tenantId}`,
    );
    return createdCase;
  }

  async update(params: {
    tenantId: string;
    caseId: string;
    title?: string;
    description?: string;
    severity?: string;
    priority?: string;
    queue?: string;
  }) {
    await this.getById(params.tenantId, params.caseId);

    const data: Record<string, unknown> = {};
    if (params.title) data.title = params.title;
    if (params.description) data.description = params.description;
    if (params.severity) data.severity = params.severity;
    if (params.priority) data.priority = params.priority;
    if (params.queue) data.queue_id = params.queue;

    return this.prisma.case.update({
      where: { id: params.caseId },
      data,
    });
  }

  async assign(params: {
    tenantId: string;
    caseId: string;
    ownerId: string;
    actorId: string;
  }) {
    const caseRow = await this.getById(params.tenantId, params.caseId);

    const updated = await this.prisma.case.update({
      where: { id: params.caseId },
      data: { owner_id: params.ownerId },
    });

    await this.timeline.append({
      tenantId: caseRow.tenant_id,
      caseId: params.caseId,
      entryType: 'ASSIGNMENT_CHANGED',
      actorId: params.actorId,
      title: 'Case assigned',
      summary: `Assigned case to owner '${params.ownerId}'`,
    });

    return updated;
  }

  /**
   * Link an existing evidence record to a case: creates the actual
   * CaseEvidence relation (which GET /api/v1/evidence?caseId= and the
   * evidence ledger UI both query) alongside the timeline entry, in one
   * transaction — writing only a timeline entry would look like a real
   * link but leave the evidence invisible to every case-scoped evidence
   * query (the exact bug already fixed in shield-ingest's equivalent
   * method this session).
   */
  async linkEvidence(params: {
    tenantId: string;
    caseId: string;
    evidenceId: string;
    actorId: string;
  }) {
    const caseRow = await this.getById(params.tenantId, params.caseId);

    const evidence = await this.prisma.evidenceRecord.findFirst({
      where: { id: params.evidenceId, tenant_id: params.tenantId },
      select: { id: true },
    });
    if (!evidence) {
      throw new NotFoundException(`Evidence '${params.evidenceId}' not found`);
    }

    const [caseEvidence] = await this.prisma.$transaction([
      this.prisma.caseEvidence.create({
        data: {
          tenant_id: caseRow.tenant_id,
          case_id: params.caseId,
          evidence_id: params.evidenceId,
          added_by: params.actorId,
        },
      }),
      this.prisma.caseTimelineEntry.create({
        data: {
          tenant_id: caseRow.tenant_id,
          case_id: params.caseId,
          entry_type: 'EVIDENCE_ATTACHED',
          actor_id: params.actorId,
          title: 'Evidence linked',
          summary: `Linked evidence '${params.evidenceId}'`,
          evidence_ref: params.evidenceId,
        },
      }),
    ]);

    return caseEvidence;
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

    // A material outcome needs a second pair of eyes before it becomes the
    // record of what happened — not after (spec: material dispositions and
    // sampled closures require peer/supervisor review).
    const requiredReview = this.qualityReview.requiresReview({
      severity: caseRow.severity,
      toState: params.toState,
      disposition: params.disposition,
    });
    if (requiredReview) {
      const approved = await this.qualityReview.hasApproval(
        params.tenantId,
        params.caseId,
      );
      if (!approved) {
        const review = await this.qualityReview.request({
          tenantId: params.tenantId,
          caseId: params.caseId,
          reviewType: requiredReview,
          requestedBy: params.actorId,
          trigger: `${caseRow.severity} case moving to ${params.toState}${
            params.disposition ? ` (${params.disposition})` : ''
          }`,
        });
        throw new ConflictException({
          statusCode: 409,
          error: 'CASE_QUALITY_REVIEW_REQUIRED',
          message: `A ${requiredReview} must be approved by another reviewer before this case can move to ${params.toState}`,
          reviewId: review.id,
        });
      }
    }

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

    await this.syncSlaClockForTransition({
      tenantId: params.tenantId,
      caseId: params.caseId,
      severity: caseRow.severity,
      toState: params.toState,
      actorId: params.actorId,
    });

    return transition;
  }

  /**
   * The triage clock starts when a case is actually picked up (TRIAGED) and
   * stops when it reaches a terminal state — a clock that ran from case
   * creation would bill queue time as response time, and one that never
   * stopped could never produce a compliant measurement.
   */
  private async syncSlaClockForTransition(params: {
    tenantId: string;
    caseId: string;
    severity: string;
    toState: CaseStatus;
    actorId: string;
  }) {
    try {
      if (params.toState === 'TRIAGED') {
        await this.slaClock.startTriageClock({
          caseId: params.caseId,
          tenantId: params.tenantId,
          severity: params.severity,
        });
        await this.timeline.append({
          tenantId: params.tenantId,
          caseId: params.caseId,
          entryType: 'STATUS_CHANGED',
          actorId: params.actorId,
          title: 'SLA triage clock started',
          summary: `Response clock started for ${params.severity} severity`,
        });
        return;
      }

      if (params.toState === 'RESOLVED' || params.toState === 'CLOSED') {
        const existing = await this.slaClock.getClock(params.caseId);
        if (!existing || existing.stoppedAt) return;

        const { isBreached, activeTriageMinutes } =
          await this.slaClock.stopClock(params.caseId);
        await this.timeline.append({
          tenantId: params.tenantId,
          caseId: params.caseId,
          entryType: 'STATUS_CHANGED',
          actorId: params.actorId,
          title: isBreached
            ? 'SLA triage clock stopped — target breached'
            : 'SLA triage clock stopped — within target',
          summary: `Net active triage: ${activeTriageMinutes}m`,
        });
      }
    } catch (err) {
      // SLA bookkeeping must never roll back or block the case transition
      // itself — the state change is the security-relevant fact.
      this.logger.error(
        `SLA clock sync failed for case '${params.caseId}': ${(err as Error).message}`,
      );
    }
  }

  async pauseSlaClock(params: {
    tenantId: string;
    caseId: string;
    reason: string;
    actorId: string;
  }) {
    await this.getById(params.tenantId, params.caseId);
    const clock = await this.slaClock.pauseClock(params.caseId, params.reason);
    await this.timeline.append({
      tenantId: params.tenantId,
      caseId: params.caseId,
      entryType: 'STATUS_CHANGED',
      actorId: params.actorId,
      title: 'SLA triage clock paused',
      summary: params.reason,
    });
    return clock;
  }

  async resumeSlaClock(params: {
    tenantId: string;
    caseId: string;
    actorId: string;
  }) {
    await this.getById(params.tenantId, params.caseId);
    const clock = await this.slaClock.resumeClock(params.caseId);
    await this.timeline.append({
      tenantId: params.tenantId,
      caseId: params.caseId,
      entryType: 'STATUS_CHANGED',
      actorId: params.actorId,
      title: 'SLA triage clock resumed',
      summary: 'Response clock resumed',
    });
    return clock;
  }

  async getSlaClock(tenantId: string, caseId: string) {
    await this.getById(tenantId, caseId);
    // Surfacing a stale RUNNING clock as on-time would understate a breach.
    const existing = await this.slaClock.getClock(caseId);
    if (!existing) return null;
    return existing.status === 'RUNNING'
      ? this.slaClock.markBreachedIfOverdue(caseId)
      : existing;
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
