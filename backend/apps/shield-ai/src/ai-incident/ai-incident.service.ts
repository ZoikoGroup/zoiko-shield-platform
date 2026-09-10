import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import * as crypto from 'crypto';
import {
  AiIncidentCategory,
  AiIncidentSeverity,
  AiIncidentStatus,
  DeclareAiIncidentDto,
  ContainIncidentDto,
  FallbackIncidentDto,
  CompleteRcaDto,
  ResolveIncidentDto,
} from './dto/declare-incident.dto';
import { AiKillSwitchService } from '../kill-switch/ai-kill-switch.service';

export interface AiIncidentTimelineEntry {
  timestamp: string;
  fromStatus?: AiIncidentStatus;
  toStatus: AiIncidentStatus;
  action: string;
  actor: string;
  details?: Record<string, any>;
}

export interface AiIncidentRecord {
  id: string;
  tenantId: string;
  title: string;
  category: AiIncidentCategory;
  severity: AiIncidentSeverity;
  status: AiIncidentStatus;
  description: string;
  affectedModel?: string;
  affectedPromptKey?: string;
  affectedTool?: string;
  killSwitchActive: boolean;
  killSwitchDetails?: ContainIncidentDto;
  fallbackActive: boolean;
  fallbackDetails?: FallbackIncidentDto;
  rcaSummary?: string;
  rcaDetails?: CompleteRcaDto;
  resolutionSummary?: string;
  declaredAt: string;
  resolvedAt?: string;
  closedAt?: string;
  timeline: AiIncidentTimelineEntry[];
}

/**
 * §23: AI Incident Lifecycle Management Service
 * Oversees the formal AI incident response state machine:
 * DECLARED -> CONTAINED_KILL_SWITCH -> FALLBACK_ACTIVE -> ROOT_CAUSE_ANALYZED -> RESOLVED -> CLOSED
 */
@Injectable()
export class AiIncidentService {
  private readonly logger = new Logger(AiIncidentService.name);
  private readonly incidents = new Map<string, AiIncidentRecord>();

  constructor(
    @Optional() private readonly killSwitchService?: AiKillSwitchService,
  ) {}

  /**
   * Declare a new AI safety/security incident
   */
  async declareIncident(
    tenantId: string,
    dto: DeclareAiIncidentDto,
    actorId = 'system',
  ): Promise<AiIncidentRecord> {
    if (!tenantId) {
      throw new BadRequestException(
        'tenantId is required to declare an AI incident',
      );
    }

    const incidentId = `ai-inc-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const incident: AiIncidentRecord = {
      id: incidentId,
      tenantId,
      title: dto.title,
      category: dto.category,
      severity: dto.severity,
      status: 'DECLARED',
      description: dto.description,
      affectedModel: dto.affectedModel,
      affectedPromptKey: dto.affectedPromptKey,
      affectedTool: dto.affectedTool,
      killSwitchActive: false,
      fallbackActive: false,
      declaredAt: now,
      timeline: [
        {
          timestamp: now,
          toStatus: 'DECLARED',
          action: 'INCIDENT_DECLARED',
          actor: actorId,
          details: {
            severity: dto.severity,
            category: dto.category,
            affectedModel: dto.affectedModel,
          },
        },
      ],
    };

    this.incidents.set(incidentId, incident);
    this.logger.warn(
      `🚨 AI Incident Declared [${incidentId}] - ${dto.severity} - ${dto.title} for tenant ${tenantId}`,
    );

    // Auto-contain critical incidents if requested or SEV1
    if (dto.autoContain || dto.severity === 'SEV1_CRITICAL') {
      const target = dto.affectedModel || dto.affectedPromptKey || '*';
      const scope = dto.affectedModel
        ? 'MODEL_ROUTE'
        : dto.affectedPromptKey
          ? 'PROMPT'
          : 'TENANT';

      await this.containIncident(
        tenantId,
        incidentId,
        {
          reason: `Automatic containment triggered for ${dto.severity} incident ${incidentId}`,
          killSwitchScope: scope as any,
          targetId: scope === 'TENANT' ? tenantId : target,
          containedBy: 'system:auto-containment',
        },
        'system:auto-containment',
      );
    }

    return this.incidents.get(incidentId)!;
  }

  /**
   * Contain incident by engaging granular kill switches
   */
  async containIncident(
    tenantId: string,
    incidentId: string,
    dto: ContainIncidentDto,
    actorId = 'soc-operator',
  ): Promise<AiIncidentRecord> {
    const incident = this.getIncidentOrThrow(tenantId, incidentId);

    if (
      incident.status !== 'DECLARED' &&
      incident.status !== 'CONTAINED_KILL_SWITCH'
    ) {
      throw new BadRequestException(
        `Cannot contain incident in status '${incident.status}'. Must be in DECLARED.`,
      );
    }

    // Engage the Kill Switch if service is wired
    if (this.killSwitchService) {
      this.killSwitchService.activateKillSwitch({
        scope: dto.killSwitchScope,
        targetId: dto.targetId,
        reason: dto.reason,
        activatedBy: dto.containedBy || actorId,
      });
    }

    const fromStatus = incident.status;
    incident.status = 'CONTAINED_KILL_SWITCH';
    incident.killSwitchActive = true;
    incident.killSwitchDetails = dto;

    incident.timeline.push({
      timestamp: new Date().toISOString(),
      fromStatus,
      toStatus: 'CONTAINED_KILL_SWITCH',
      action: 'KILL_SWITCH_CONTAINMENT_ENGAGED',
      actor: actorId,
      details: { ...dto },
    });

    this.logger.log(
      `✔ Incident [${incidentId}] contained via ${dto.killSwitchScope}:${dto.targetId}`,
    );

    return incident;
  }

  /**
   * Activate fallback routing for the affected model/feature
   */
  async activateFallback(
    tenantId: string,
    incidentId: string,
    dto: FallbackIncidentDto,
    actorId = 'soc-operator',
  ): Promise<AiIncidentRecord> {
    const incident = this.getIncidentOrThrow(tenantId, incidentId);

    if (
      incident.status !== 'CONTAINED_KILL_SWITCH' &&
      incident.status !== 'DECLARED'
    ) {
      throw new BadRequestException(
        `Cannot activate fallback from status '${incident.status}'. Must be DECLARED or CONTAINED_KILL_SWITCH.`,
      );
    }

    const fromStatus = incident.status;
    incident.status = 'FALLBACK_ACTIVE';
    incident.fallbackActive = true;
    incident.fallbackDetails = dto;

    incident.timeline.push({
      timestamp: new Date().toISOString(),
      fromStatus,
      toStatus: 'FALLBACK_ACTIVE',
      action: 'FALLBACK_ROUTE_ACTIVATED',
      actor: actorId,
      details: { ...dto },
    });

    return incident;
  }

  /**
   * Complete Root Cause Analysis (RCA)
   */
  async completeRca(
    tenantId: string,
    incidentId: string,
    dto: CompleteRcaDto,
    actorId = 'ai-safety-engineer',
  ): Promise<AiIncidentRecord> {
    const incident = this.getIncidentOrThrow(tenantId, incidentId);

    if (
      incident.status !== 'FALLBACK_ACTIVE' &&
      incident.status !== 'CONTAINED_KILL_SWITCH' &&
      incident.status !== 'DECLARED'
    ) {
      throw new BadRequestException(
        `Cannot complete RCA from current status '${incident.status}'.`,
      );
    }

    const fromStatus = incident.status;
    incident.status = 'ROOT_CAUSE_ANALYZED';
    incident.rcaSummary = dto.rootCauseSummary;
    incident.rcaDetails = dto;

    incident.timeline.push({
      timestamp: new Date().toISOString(),
      fromStatus,
      toStatus: 'ROOT_CAUSE_ANALYZED',
      action: 'RCA_COMPLETED',
      actor: actorId,
      details: {
        rootCauseSummary: dto.rootCauseSummary,
        preventativeCount: dto.preventativeActions.length,
      },
    });

    return incident;
  }

  /**
   * Resolve incident and optionally disengage emergency kill switches
   */
  async resolveIncident(
    tenantId: string,
    incidentId: string,
    dto: ResolveIncidentDto,
    actorId = 'soc-lead',
  ): Promise<AiIncidentRecord> {
    const incident = this.getIncidentOrThrow(tenantId, incidentId);

    if (
      incident.status !== 'ROOT_CAUSE_ANALYZED' &&
      incident.status !== 'FALLBACK_ACTIVE' &&
      incident.status !== 'CONTAINED_KILL_SWITCH'
    ) {
      throw new BadRequestException(
        `Cannot resolve incident in status '${incident.status}'. RCA or fallback should be completed first.`,
      );
    }

    // Disengage kill switch if requested
    if (
      dto.disengageKillSwitch &&
      incident.killSwitchDetails &&
      this.killSwitchService
    ) {
      this.killSwitchService.deactivateKillSwitch({
        scope: incident.killSwitchDetails.killSwitchScope,
        targetId: incident.killSwitchDetails.targetId,
        deactivatedBy: dto.resolvedBy || actorId,
      });
      incident.killSwitchActive = false;
    }

    const fromStatus = incident.status;
    incident.status = 'RESOLVED';
    incident.resolutionSummary = dto.resolutionSummary;
    incident.resolvedAt = new Date().toISOString();

    incident.timeline.push({
      timestamp: incident.resolvedAt,
      fromStatus,
      toStatus: 'RESOLVED',
      action: 'INCIDENT_RESOLVED',
      actor: actorId,
      details: {
        resolutionSummary: dto.resolutionSummary,
        killSwitchDisengaged: dto.disengageKillSwitch ?? false,
      },
    });

    return incident;
  }

  /**
   * Close incident
   */
  async closeIncident(
    tenantId: string,
    incidentId: string,
    actorId = 'soc-lead',
  ): Promise<AiIncidentRecord> {
    const incident = this.getIncidentOrThrow(tenantId, incidentId);

    if (incident.status !== 'RESOLVED') {
      throw new BadRequestException(
        `Cannot close incident in status '${incident.status}'. Must be in RESOLVED status first.`,
      );
    }

    const fromStatus = incident.status;
    incident.status = 'CLOSED';
    incident.closedAt = new Date().toISOString();

    incident.timeline.push({
      timestamp: incident.closedAt,
      fromStatus,
      toStatus: 'CLOSED',
      action: 'INCIDENT_CLOSED',
      actor: actorId,
    });

    return incident;
  }

  /**
   * Get single incident by ID
   */
  getIncident(tenantId: string, incidentId: string): AiIncidentRecord {
    return this.getIncidentOrThrow(tenantId, incidentId);
  }

  /**
   * List incidents for tenant with optional filtering
   */
  listIncidents(
    tenantId: string,
    filters?: {
      status?: AiIncidentStatus;
      severity?: AiIncidentSeverity;
      category?: AiIncidentCategory;
    },
  ): AiIncidentRecord[] {
    const results: AiIncidentRecord[] = [];

    for (const inc of this.incidents.values()) {
      if (inc.tenantId !== tenantId) {
        continue;
      }
      if (filters?.status && inc.status !== filters.status) {
        continue;
      }
      if (filters?.severity && inc.severity !== filters.severity) {
        continue;
      }
      if (filters?.category && inc.category !== filters.category) {
        continue;
      }
      results.push(inc);
    }

    return results.sort(
      (a, b) =>
        new Date(b.declaredAt).getTime() - new Date(a.declaredAt).getTime(),
    );
  }

  /**
   * Get tenant incident metrics
   */
  getMetrics(tenantId: string) {
    const tenantIncs = this.listIncidents(tenantId);

    const activeCount = tenantIncs.filter(
      (i) => i.status !== 'RESOLVED' && i.status !== 'CLOSED',
    ).length;

    const criticalCount = tenantIncs.filter(
      (i) => i.severity === 'SEV1_CRITICAL' && i.status !== 'CLOSED',
    ).length;

    return {
      totalIncidents: tenantIncs.length,
      activeIncidents: activeCount,
      criticalIncidents: criticalCount,
      containedKillSwitches: tenantIncs.filter((i) => i.killSwitchActive)
        .length,
    };
  }

  private getIncidentOrThrow(
    tenantId: string,
    incidentId: string,
  ): AiIncidentRecord {
    const inc = this.incidents.get(incidentId);
    if (!inc || inc.tenantId !== tenantId) {
      throw new NotFoundException(
        `AI Incident '${incidentId}' not found for tenant '${tenantId}'`,
      );
    }
    return inc;
  }

  clearAll(): void {
    this.incidents.clear();
  }
}
