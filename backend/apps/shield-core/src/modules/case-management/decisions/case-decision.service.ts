import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { CaseTimelineService } from '../timeline/case-timeline.service';
import { EvidenceAutoCreationService } from '../../evidence/evidence-auto-creation.service';
import { CASE_TOPICS } from '../events/case-events';

export type DecisionType =
  | 'FALSE_POSITIVE_DECISION'
  | 'ESCALATE_TO_INCIDENT'
  | 'RESPONSE_RECOMMENDATION'
  | 'ACCEPT_RISK'
  | 'CLOSE_CASE';

/** Spec §17 — material decisions must retain evidence references; every decision here triggers automatic evidence creation and an append-only timeline entry, never just a bare row. */
@Injectable()
export class CaseDecisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly timeline: CaseTimelineService,
    private readonly evidenceAutoCreation: EvidenceAutoCreationService,
  ) {}

  async record(params: {
    tenantId: string;
    caseId: string;
    decisionType: DecisionType;
    decision: string;
    rationale: string;
    actorId: string;
    policyVersion?: string;
  }) {
    const caseRecord = await this.prisma.case.findFirst({
      where: { id: params.caseId, tenant_id: params.tenantId },
      select: { environment_id: true, region: true },
    });
    if (!caseRecord) {
      throw new NotFoundException(`Case '${params.caseId}' not found`);
    }

    const evidence = await this.evidenceAutoCreation.createForCaseDecision({
      tenantId: params.tenantId,
      environmentId: caseRecord.environment_id,
      region: caseRecord.region,
      caseId: params.caseId,
      decisionType: params.decisionType,
      decision: params.decision,
      rationale: params.rationale,
      actorId: params.actorId,
    });

    const [decision] = await this.prisma.$transaction([
      this.prisma.caseDecision.create({
        data: {
          tenant_id: params.tenantId,
          case_id: params.caseId,
          decision_type: params.decisionType,
          decision: params.decision,
          rationale: params.rationale,
          actor_id: params.actorId,
          evidence_refs: JSON.stringify([evidence.id]),
          policy_version: params.policyVersion,
        },
      }),
      this.prisma.outboxEvent.create({
        data: this.outbox.build({
          tenantId: params.tenantId,
          topic: CASE_TOPICS.CASE_DECISION_RECORDED,
          eventType: 'case.decision.recorded',
          payload: {
            caseId: params.caseId,
            decisionType: params.decisionType,
            evidenceId: evidence.id,
          },
        }),
      }),
    ]);

    await this.timeline.append({
      tenantId: params.tenantId,
      caseId: params.caseId,
      entryType: 'DECISION_RECORDED',
      actorId: params.actorId,
      title: `Decision recorded: ${params.decisionType}`,
      summary: params.rationale,
      evidenceRef: evidence.id,
    });

    return decision;
  }

  async listForCase(tenantId: string, caseId: string) {
    return this.prisma.caseDecision.findMany({
      where: { tenant_id: tenantId, case_id: caseId },
      orderBy: { created_at: 'asc' },
    });
  }
}
