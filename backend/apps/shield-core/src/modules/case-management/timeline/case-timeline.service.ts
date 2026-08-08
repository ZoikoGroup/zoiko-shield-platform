import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export type TimelineEntryType =
  | 'CASE_CREATED'
  | 'ALERT_LINKED'
  | 'ASSIGNMENT_CHANGED'
  | 'STATUS_CHANGED'
  | 'NOTE_ADDED'
  | 'QUERY_EXECUTED'
  | 'EVIDENCE_ATTACHED'
  | 'HYPOTHESIS_ADDED'
  | 'DECISION_RECORDED'
  | 'CUSTOMER_COMMUNICATION'
  | 'ACTION_RECOMMENDED'
  | 'CASE_RESOLVED';

/**
 * Append-only investigation timeline (spec §14). No update/delete method
 * is exposed on this service by design — corrections must append a new
 * entry referencing the one being corrected, never mutate history.
 */
@Injectable()
export class CaseTimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async append(params: {
    tenantId: string;
    caseId: string;
    entryType: TimelineEntryType;
    actorId: string;
    title: string;
    summary: string;
    sourceRef?: string;
    evidenceRef?: string;
    correlationId?: string;
  }) {
    return this.prisma.caseTimelineEntry.create({
      data: {
        tenant_id: params.tenantId,
        case_id: params.caseId,
        entry_type: params.entryType,
        actor_id: params.actorId,
        title: params.title,
        summary: params.summary,
        source_ref: params.sourceRef,
        evidence_ref: params.evidenceRef,
        correlation_id: params.correlationId,
      },
    });
  }

  async listForCase(tenantId: string, caseId: string) {
    return this.prisma.caseTimelineEntry.findMany({
      where: { tenant_id: tenantId, case_id: caseId },
      orderBy: { occurred_at: 'asc' },
    });
  }
}
