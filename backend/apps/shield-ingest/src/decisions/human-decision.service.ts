import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export class RecordHumanDecisionDto {
  decisionType!:
    | 'TRIAGE_DECISION'
    | 'FALSE_POSITIVE_DECISION'
    | 'INCIDENT_DECLARATION'
    | 'RESPONSE_RECOMMENDATION'
    | 'CONTROL_REVIEW'
    | 'CASE_CLOSURE';
  decision!: string;
  reason?: string;
  evidenceIds?: string[];
  aiRunId?: string;
  acceptedAiContent?: boolean;
  actorId?: string;
}

@Injectable()
export class HumanDecisionService {
  private readonly logger = new Logger(HumanDecisionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record analyst human decision separately from AI outputs and append to CaseTimeline
   */
  async recordDecision(
    tenantId: string,
    caseId: string,
    dto: RecordHumanDecisionDto,
  ) {
    const caseRecord = await this.prisma.case.findFirst({
      where: { id: caseId, tenant_id: tenantId },
    });

    if (!caseRecord) {
      throw new NotFoundException(`Case '${caseId}' not found`);
    }

    if (!dto.decision || dto.decision.trim().length === 0) {
      throw new BadRequestException('Decision text cannot be empty');
    }

    const actorId = dto.actorId || 'system';

    const decisionRecord = await this.prisma.caseDecision.create({
      data: {
        tenant_id: caseRecord.tenant_id,
        case_id: caseId,
        decision_type: dto.decisionType,
        decision: dto.decision,
        rationale: dto.reason || dto.decision,
        evidence_refs: JSON.stringify(dto.evidenceIds || []),
        actor_id: actorId,
      },
    });

    // Automatically append DECISION_RECORDED event to CaseTimelineEntry
    const timelineDelegate =
      this.prisma.caseTimelineEntry || (this.prisma as any).caseTimeline;
    await timelineDelegate.create({
      data: {
        tenant_id: caseRecord.tenant_id,
        case_id: caseId,
        entry_type: 'DECISION_RECORDED',
        actor_id: actorId,
        title: 'Decision Recorded',
        summary: dto.decision,
      },
    });

    return decisionRecord;
  }

  /**
   * Get human decisions for a case
   */
  async getDecisionsByCase(tenantId: string, caseId: string) {
    const caseRecord = await this.prisma.case.findFirst({
      where: { id: caseId, tenant_id: tenantId },
    });

    if (!caseRecord) {
      throw new NotFoundException(`Case '${caseId}' not found`);
    }

    return this.prisma.caseDecision.findMany({
      where: { case_id: caseId, tenant_id: tenantId },
      orderBy: { created_at: 'desc' },
    });
  }
}
