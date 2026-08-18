import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  requireEnvironmentId,
  requireRegion,
  requireTenantId,
} from '../security/tenant-context';

const ALLOWED_CASE_TRANSITIONS: Record<string, string[]> = {
  NEW: ['TRIAGED', 'DUPLICATE', 'FALSE_POSITIVE'],
  TRIAGED: ['INVESTIGATING', 'ACCEPTED_RISK', 'DUPLICATE', 'FALSE_POSITIVE'],
  INVESTIGATING: [
    'CONTAINMENT_PENDING',
    'CONTAINED',
    'REMEDIATING',
    'MONITORING',
    'RESOLVED',
    'CUSTOMER_ACTION_REQUIRED',
    'THIRD_PARTY_DEPENDENCY',
  ],
  CONTAINMENT_PENDING: ['CONTAINED'],
  CONTAINED: ['REMEDIATING', 'RESOLVED'],
  REMEDIATING: ['MONITORING', 'RESOLVED'],
  MONITORING: ['RESOLVED', 'REMEDIATING'],
  RESOLVED: ['CLOSED', 'INVESTIGATING'],
  DUPLICATE: ['CLOSED'],
  FALSE_POSITIVE: ['CLOSED'],
  ACCEPTED_RISK: ['CLOSED'],
  CUSTOMER_ACTION_REQUIRED: ['INVESTIGATING', 'RESOLVED', 'CLOSED'],
  THIRD_PARTY_DEPENDENCY: ['INVESTIGATING', 'RESOLVED', 'CLOSED'],
  CLOSED: [],
};

export class CreateCaseDto {
  tenantId?: string;
  environmentId!: string;
  region!: string;
  title!: string;
  description?: string;
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  priority?: 'P1' | 'P2' | 'P3' | 'P4';
  queue?: string;
  sourceAlertIds?: string[];
  affectedAssets?: string[];
  affectedIdentities?: string[];
  createdBy?: string;
}

export class UpdateCaseDto {
  title?: string;
  description?: string;
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  priority?: 'P1' | 'P2' | 'P3' | 'P4';
  queue?: string;
}

@Injectable()
export class CaseManagementService {
  private readonly logger = new Logger(CaseManagementService.name);

  constructor(private readonly prisma: PrismaService) {}

  private get timelineDelegate() {
    return this.prisma.caseTimelineEntry || (this.prisma as any).caseTimeline;
  }

  /**
   * Create a new investigation case and log initial CREATED timeline event
   */
  async createCase(dto: CreateCaseDto) {
    const tenantId = requireTenantId(dto.tenantId);
    const environmentId = requireEnvironmentId(dto.environmentId);
    const region = requireRegion(dto.region);

    this.logger.log(`Creating case '${dto.title}' for tenant ${tenantId}`);

    const caseRecord = await this.prisma.case.create({
      data: {
        tenant_id: tenantId,
        environment_id: environmentId,
        region,
        title: dto.title,
        description: dto.description,
        severity: dto.severity || 'HIGH',
        priority: dto.priority || 'P2',
        status: 'NEW',
        queue_id: dto.queue || 'DEFAULT',
        ...((dto as any).queue ? { queue: dto.queue } : {}),
        created_by: dto.createdBy || 'system',
      },
    });

    // Record initial CREATED timeline entry
    await this.timelineDelegate.create({
      data: {
        tenant_id: tenantId,
        case_id: caseRecord.id,
        entry_type: 'CREATED',
        actor_id: dto.createdBy || 'system',
        title: 'Case Created',
        summary: `Case '${dto.title}' created in NEW state`,
      },
    });

    return caseRecord;
  }

  /**
   * Get single case with complete timeline history
   */
  async getCaseById(tenantId: string, caseId: string) {
    const caseRecord = await this.prisma.case.findFirst({
      where: { id: caseId, tenant_id: tenantId },
      include: {
        timelineEntries: true,
      },
    });

    if (!caseRecord) {
      throw new NotFoundException(`Case with ID '${caseId}' not found`);
    }

    return caseRecord;
  }

  /**
   * List cases for a tenant
   */
  async getCases(
    tenantId: string,
    status?: string,
    severity?: string,
    ownerId?: string,
  ) {
    const where: any = { tenant_id: tenantId };
    if (status) where.status = status;
    if (severity) where.severity = severity;
    if (ownerId) where.owner_id = ownerId;

    return this.prisma.case.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        timelineEntries: { take: 3, orderBy: { created_at: 'desc' } },
      },
    });
  }

  /**
   * Update case fields
   */
  async updateCase(tenantId: string, caseId: string, dto: UpdateCaseDto) {
    await this.getCaseById(tenantId, caseId);

    const updateData: any = {};
    if (dto.title) updateData.title = dto.title;
    if (dto.description) updateData.description = dto.description;
    if (dto.severity) updateData.severity = dto.severity;
    if (dto.priority) updateData.priority = dto.priority;
    if (dto.queue) {
      updateData.queue_id = dto.queue;
      updateData.queue = dto.queue;
    }

    return this.prisma.case.update({
      where: { id: caseId },
      data: updateData,
    });
  }

  /**
   * Assign case owner and append ASSIGNED timeline event
   */
  async assignCase(
    tenantId: string,
    caseId: string,
    ownerId: string,
    actorId = 'system',
  ) {
    const caseRecord = await this.getCaseById(tenantId, caseId);

    const updated = await this.prisma.case.update({
      where: { id: caseId },
      data: { owner_id: ownerId },
    });

    await this.timelineDelegate.create({
      data: {
        tenant_id: caseRecord.tenant_id,
        case_id: caseId,
        entry_type: 'ASSIGNED',
        actor_id: actorId,
        title: 'Case Assigned',
        summary: `Assigned case to owner '${ownerId}'`,
      },
    });

    return updated;
  }

  /**
   * Transition case state per validated state machine rules
   */
  async transitionState(
    tenantId: string,
    caseId: string,
    targetStatus: string,
    actorId = 'system',
    reason?: string,
  ) {
    const caseRecord = await this.getCaseById(tenantId, caseId);
    const currentStatus = caseRecord.status;

    const allowed = ALLOWED_CASE_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(targetStatus)) {
      throw new ConflictException(
        `Illegal case transition from '${currentStatus}' to '${targetStatus}'`,
      );
    }

    const dataToUpdate: any = { status: targetStatus };
    const now = new Date();

    if (['RESOLVED', 'DUPLICATE', 'FALSE_POSITIVE'].includes(targetStatus)) {
      dataToUpdate.resolved_at = now;
    }
    if (targetStatus === 'CLOSED') {
      dataToUpdate.closed_at = now;
    }

    const updatedCase = await this.prisma.case.update({
      where: { id: caseId },
      data: dataToUpdate,
    });

    await this.timelineDelegate.create({
      data: {
        tenant_id: caseRecord.tenant_id,
        case_id: caseId,
        entry_type: 'STATE_TRANSITION',
        actor_id: actorId,
        title: 'State Transition',
        summary: `Transitioned from '${currentStatus}' to '${targetStatus}': ${reason || 'Analyst transition'}`,
      },
    });

    return updatedCase;
  }

  /**
   * Add analyst note to case timeline
   */
  async addNote(
    tenantId: string,
    caseId: string,
    noteText: string,
    actorId = 'system',
  ) {
    const caseRecord = await this.getCaseById(tenantId, caseId);

    if (!noteText || noteText.trim().length === 0) {
      throw new BadRequestException('Note text cannot be empty');
    }

    return this.timelineDelegate.create({
      data: {
        tenant_id: caseRecord.tenant_id,
        case_id: caseId,
        entry_type: 'NOTE_ADDED',
        actor_id: actorId,
        title: 'Note Added',
        summary: noteText,
      },
    });
  }

  /**
   * Link evidence record to case timeline
   */
  async linkEvidence(
    tenantId: string,
    caseId: string,
    evidenceId: string,
    actorId = 'system',
  ) {
    const caseRecord = await this.getCaseById(tenantId, caseId);

    const evidence = await this.prisma.evidenceRecord.findFirst({
      where: { id: evidenceId, tenant_id: tenantId },
      select: { id: true },
    });
    if (!evidence) {
      throw new NotFoundException(`Evidence '${evidenceId}' not found`);
    }

    return this.timelineDelegate.create({
      data: {
        tenant_id: caseRecord.tenant_id,
        case_id: caseId,
        entry_type: 'EVIDENCE_LINKED',
        actor_id: actorId,
        title: 'Evidence Linked',
        summary: `Linked evidence '${evidenceId}'`,
        evidence_ref: evidenceId,
      },
    });
  }

  /**
   * Query case timeline entries
   */
  async getCaseTimeline(tenantId: string, caseId: string) {
    await this.getCaseById(tenantId, caseId);

    return this.timelineDelegate.findMany({
      where: { case_id: caseId, tenant_id: tenantId },
      orderBy: { created_at: 'asc' },
    });
  }
}
