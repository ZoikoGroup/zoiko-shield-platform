import {
  BadRequestException,
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
import { ALERT_TOPICS } from '../../alert/events/alert-events';
import { AlertStateMachineService } from '../../alert/state-machine/alert-state-machine.service';

/**
 * Topic per hop of the alert's escalation route, so consumers of the alert
 * stream see the same events they would have seen had an operator walked
 * the alert through the queue by hand.
 */
const ALERT_ESCALATION_TOPICS: Record<string, string> = {
  ACKNOWLEDGED: ALERT_TOPICS.ALERT_ACKNOWLEDGED,
  TRIAGED: ALERT_TOPICS.ALERT_TRIAGED,
  ESCALATED_TO_CASE: ALERT_TOPICS.ALERT_ESCALATED,
};

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
    private readonly alertStateMachine: AlertStateMachineService,
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

    // One alert escalates to exactly one case. Both the operator-initiated
    // POST /cases and the automatic promotion consumer land here, and Kafka
    // redelivery can replay the same alert.created event, so a second call
    // for the same alert must return the case that already exists instead of
    // opening a duplicate investigation.
    const existingLink = await this.prisma.caseAlert.findFirst({
      where: {
        tenant_id: params.tenantId,
        alert_id: alert.id,
        relationship_type: 'PRIMARY',
      },
      select: { case_id: true },
    });
    if (existingLink) {
      this.logger.debug(
        `Alert ${alert.id} is already escalated to case ${existingLink.case_id} — returning it rather than opening a second case.`,
      );
      const existingCase = await this.caseRepository.findByTenantAndId(
        params.tenantId,
        existingLink.case_id,
      );
      if (!existingCase) {
        // The link survived its case, which should not happen — say so
        // rather than quietly returning null to the caller.
        throw new NotFoundException(
          `Alert '${alert.id}' is linked to case '${existingLink.case_id}', which no longer exists for this tenant`,
        );
      }
      return existingCase;
    }

    const caseId = randomUUID();
    const correlationId = randomUUID();

    // Walk the alert to ESCALATED_TO_CASE through its own allow-listed
    // route. Before this, creating a case left the alert sitting in NEW, so
    // the alert queue never showed that the alert had been dealt with.
    //
    // Some states have no route there at all — a CLOSED or SUPPRESSED alert
    // that an analyst decides to investigate after all. Opening the case is
    // the point of the request, so a missing route leaves the alert's status
    // untouched and is recorded on the case, rather than refusing to open an
    // investigation because of where the alert sits in its own lifecycle.
    let alertRoute: string[] = [];
    let alertRouteBlockedReason: string | null = null;
    try {
      alertRoute = this.alertStateMachine.pathTo(
        alert.status,
        'ESCALATED_TO_CASE',
      );
    } catch (err) {
      alertRouteBlockedReason = (err as Error).message;
      this.logger.warn(
        `Opening case for alert ${alert.id} but leaving its status at '${alert.status}': ${alertRouteBlockedReason}`,
      );
    }

    const createdCase = await this.prisma.$transaction(async (tx) => {
      const created = await tx.case.create({
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
      });
      await tx.caseAlert.create({
        data: {
          tenant_id: params.tenantId,
          case_id: caseId,
          alert_id: alert.id,
          linked_by: params.actorId,
          relationship_type: 'PRIMARY',
        },
      });
      await tx.outboxEvent.create({
        data: this.outbox.build({
          tenantId: params.tenantId,
          topic: CASE_TOPICS.CASE_CREATED,
          eventType: 'case.created',
          payload: { caseId, alertId: alert.id },
          correlationId,
        }),
      });

      let alertStatus = alert.status;
      for (const toStatus of alertRoute) {
        await tx.alert.update({
          where: { id: alert.id },
          data: {
            status: toStatus,
            ...(toStatus === 'ACKNOWLEDGED'
              ? { acknowledged_at: new Date() }
              : {}),
          },
        });
        await tx.outboxEvent.create({
          data: this.outbox.build({
            tenantId: params.tenantId,
            topic:
              ALERT_ESCALATION_TOPICS[toStatus] ?? ALERT_TOPICS.ALERT_ESCALATED,
            eventType: `alert.${toStatus.toLowerCase()}`,
            payload: {
              alertId: alert.id,
              fromStatus: alertStatus,
              toStatus,
              caseId,
            },
            correlationId,
          }),
        });
        alertStatus = toStatus;
      }

      return created;
    });

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
      summary:
        alertRoute.length > 0
          ? `Alert ${alert.id} linked as PRIMARY and escalated (${[alert.status, ...alertRoute].join(' -> ')})`
          : alertRouteBlockedReason
            ? `Alert ${alert.id} linked as PRIMARY; its status stayed '${alert.status}' (${alertRouteBlockedReason})`
            : `Alert ${alert.id} linked as PRIMARY`,
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

  /**
   * Case ownership is an accountability record, so the owner has to be a real
   * active member of the tenant. Without this any string lands in owner_id and
   * the case reads as assigned to someone who cannot act on it — including a
   * typo, or a principal from another tenant.
   *
   * Memberships are TypeORM-managed in the authorization schema rather than
   * Prisma models, so this reads them the same way the offboarding services do.
   */
  private async assertActiveTenantMember(
    tenantId: string,
    principalId: string,
  ) {
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(principalId)) {
      throw new BadRequestException(
        `Owner '${principalId}' is not a valid user identifier`,
      );
    }

    // "authorization" must stay quoted — it is a reserved SQL keyword, and
    // unquoted it is a syntax error rather than a schema reference.
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) AS count
         FROM "authorization".tenant_memberships
        WHERE "tenantId" = $1::uuid
          AND "principalId" = $2::uuid
          AND status = 'ACTIVE'`,
      tenantId,
      principalId,
    );

    if (!row || Number(row.count) === 0) {
      throw new BadRequestException(
        `User '${principalId}' is not an active member of this tenant and cannot own a case`,
      );
    }
  }

  async assign(params: {
    tenantId: string;
    caseId: string;
    ownerId: string;
    actorId: string;
  }) {
    const caseRow = await this.getById(params.tenantId, params.caseId);
    await this.assertActiveTenantMember(params.tenantId, params.ownerId);

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

  /**
   * The read model behind SOC shift handover (W20).
   *
   * Handover is the one moment where a missing fact becomes someone else's
   * problem, so this is deliberately one query rather than a fan-out the
   * caller could partially fail: open cases with their response clock, their
   * pending quality reviews and their most recent notes. The outgoing shift's
   * commitments and watch items are exactly those rows.
   */
  async handoverSnapshot(tenantId: string, limit = 200) {
    return this.prisma.case.findMany({
      where: {
        tenant_id: tenantId,
        status: { notIn: ['CLOSED', 'RESOLVED'] },
      },
      take: limit,
      orderBy: [{ severity: 'asc' }, { created_at: 'asc' }],
      include: {
        slaClock: true,
        qualityReviews: {
          where: { status: 'PENDING' },
          orderBy: { created_at: 'desc' },
        },
        notes: {
          take: 3,
          orderBy: { created_at: 'desc' },
        },
      },
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
