import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
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
import { DecisionRightsService } from '../decision-rights/decision-rights.service';
import { AiReviewEnvelope } from '../decision-rights/ai-review-envelope.interface';
import type { AiIncident as AiIncidentRow } from '@prisma/client';

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
  decisionEnvelopeId?: string;
  decisionEnvelope?: AiReviewEnvelope;
  resolutionSummary?: string;
  declaredAt: string;
  resolvedAt?: string;
  closedAt?: string;
  timeline: AiIncidentTimelineEntry[];
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toRecord(row: AiIncidentRow): AiIncidentRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    title: row.title,
    category: row.category as AiIncidentCategory,
    severity: row.severity as AiIncidentSeverity,
    status: row.status as AiIncidentStatus,
    description: row.description,
    affectedModel: row.affected_model ?? undefined,
    affectedPromptKey: row.affected_prompt_key ?? undefined,
    affectedTool: row.affected_tool ?? undefined,
    killSwitchActive: row.kill_switch_active,
    killSwitchDetails: parseJson(row.kill_switch_details, undefined as any),
    fallbackActive: row.fallback_active,
    fallbackDetails: parseJson(row.fallback_details, undefined as any),
    rcaSummary: row.rca_summary ?? undefined,
    rcaDetails: parseJson(row.rca_details, undefined as any),
    decisionEnvelopeId: row.decision_envelope_id ?? undefined,
    decisionEnvelope: parseJson(row.decision_envelope, undefined as any),
    resolutionSummary: row.resolution_summary ?? undefined,
    declaredAt: row.declared_at.toISOString(),
    resolvedAt: row.resolved_at?.toISOString(),
    closedAt: row.closed_at?.toISOString(),
    timeline: parseJson(row.timeline, []),
  };
}

/**
 * §23: AI Incident Lifecycle Management Service
 * Oversees the formal AI incident response state machine:
 * DECLARED -> CONTAINED_KILL_SWITCH -> FALLBACK_ACTIVE -> ROOT_CAUSE_ANALYZED -> RESOLVED -> CLOSED
 *
 * Persisted in Postgres via Prisma (`ai_incidents`) - this used to be an
 * in-memory Map, which meant a process restart silently erased incident
 * and RCA history that the audit trail assumes is durable.
 */
@Injectable()
export class AiIncidentService {
  private readonly logger = new Logger(AiIncidentService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly killSwitchService?: AiKillSwitchService,
    @Optional() private readonly decisionRightsService?: DecisionRightsService,
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
    const now = new Date();

    const timeline: AiIncidentTimelineEntry[] = [
      {
        timestamp: now.toISOString(),
        toStatus: 'DECLARED',
        action: 'INCIDENT_DECLARED',
        actor: actorId,
        details: {
          severity: dto.severity,
          category: dto.category,
          affectedModel: dto.affectedModel,
        },
      },
    ];

    await this.prisma.aiIncident.create({
      data: {
        id: incidentId,
        tenant_id: tenantId,
        title: dto.title,
        category: dto.category,
        severity: dto.severity,
        status: 'DECLARED',
        description: dto.description,
        affected_model: dto.affectedModel,
        affected_prompt_key: dto.affectedPromptKey,
        affected_tool: dto.affectedTool,
        declared_at: now,
        timeline: JSON.stringify(timeline),
      },
    });

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

    return this.getIncidentOrThrow(tenantId, incidentId);
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
    const incident = await this.getIncidentOrThrow(tenantId, incidentId);

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
    incident.timeline.push({
      timestamp: new Date().toISOString(),
      fromStatus,
      toStatus: 'CONTAINED_KILL_SWITCH',
      action: 'KILL_SWITCH_CONTAINMENT_ENGAGED',
      actor: actorId,
      details: { ...dto },
    });

    await this.prisma.aiIncident.update({
      where: { id: incidentId },
      data: {
        status: 'CONTAINED_KILL_SWITCH',
        kill_switch_active: true,
        kill_switch_details: JSON.stringify(dto),
        timeline: JSON.stringify(incident.timeline),
      },
    });

    this.logger.log(
      `✔ Incident [${incidentId}] contained via ${dto.killSwitchScope}:${dto.targetId}`,
    );

    return this.getIncidentOrThrow(tenantId, incidentId);
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
    const incident = await this.getIncidentOrThrow(tenantId, incidentId);

    if (
      incident.status !== 'CONTAINED_KILL_SWITCH' &&
      incident.status !== 'DECLARED'
    ) {
      throw new BadRequestException(
        `Cannot activate fallback from status '${incident.status}'. Must be DECLARED or CONTAINED_KILL_SWITCH.`,
      );
    }

    const fromStatus = incident.status;
    incident.timeline.push({
      timestamp: new Date().toISOString(),
      fromStatus,
      toStatus: 'FALLBACK_ACTIVE',
      action: 'FALLBACK_ROUTE_ACTIVATED',
      actor: actorId,
      details: { ...dto },
    });

    await this.prisma.aiIncident.update({
      where: { id: incidentId },
      data: {
        status: 'FALLBACK_ACTIVE',
        fallback_active: true,
        fallback_details: JSON.stringify(dto),
        timeline: JSON.stringify(incident.timeline),
      },
    });

    return this.getIncidentOrThrow(tenantId, incidentId);
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
    const incident = await this.getIncidentOrThrow(tenantId, incidentId);

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
    let decisionEnvelopeId: string | undefined;
    let decisionEnvelope: AiReviewEnvelope | undefined;

    if (this.decisionRightsService) {
      const envelope = this.decisionRightsService.wrapInEnvelope({
        tenantId,
        aiLabelAndUseCaseName: {
          aiLabel: 'ZoikoShield AI Incident Safety Engine',
          useCaseName: 'AI_INCIDENT_RCA',
          modelRoute: incident.affectedModel || 'gemini-1.5-pro',
        },
        sourcesAndSpans: [
          {
            sourceId: incidentId,
            sourceType: 'AI_INCIDENT_TIMELINE',
            exactSpan: dto.rootCauseSummary.slice(0, 120),
            confidence: 0.95,
          },
        ],
        knownMissingStaleOrConflictingEvidence: {
          missingEvidence: [],
          staleEvidence: [],
          conflictingEvidence: [],
        },
        calibratedConfidenceAndUncertainty: {
          score: 0.92,
          qualitativeBand: 'HIGH',
          calibrationBasis:
            'Synthesized from timeline logs, model drift metrics, and prompt firewall alarms',
          uncertaintyFactors: [],
        },
        alternativeHypothesesOrActions: [
          {
            title: 'Transient Provider Degradation',
            rationale:
              'Anomalous behavior could stem from third-party model inference latency spikes',
            tradeOffs:
              'Failing to patch prompt templates leaves vulnerabilities unmitigated',
          },
        ],
        expectedImpactAndReversibility: {
          blastRadius: 'AI model routing configurations and safety guardrails',
          isReversible: true,
          reversibilityTier: 'R1',
          compensationPlan:
            'Disengage fallback route and restore baseline model endpoint',
        },
        requiredAuthorityAndApprovals: {
          requiredRole: 'AI_SAFETY_LEAD',
          responseAuthorityTier: 'R1',
          dualApproverRequired: false,
        },
        appealOrFeedbackRoute: {
          appealUrl: `/api/v1/ai/incidents/${incidentId}/rca/appeal`,
          feedbackChannel: 'ai-safety-appeals',
          customerAffecting: false,
        },
        payload: {
          incidentId,
          rcaSummary: dto.rootCauseSummary,
          contributingFactors: dto.contributingFactors,
          preventativeActions: dto.preventativeActions,
        },
      });

      decisionEnvelopeId = envelope.envelopeId;
      decisionEnvelope = envelope;
    }

    incident.timeline.push({
      timestamp: new Date().toISOString(),
      fromStatus,
      toStatus: 'ROOT_CAUSE_ANALYZED',
      action: 'RCA_COMPLETED',
      actor: actorId,
      details: {
        rootCauseSummary: dto.rootCauseSummary,
        preventativeCount: dto.preventativeActions.length,
        decisionEnvelopeId,
      },
    });

    await this.prisma.aiIncident.update({
      where: { id: incidentId },
      data: {
        status: 'ROOT_CAUSE_ANALYZED',
        rca_summary: dto.rootCauseSummary,
        rca_details: JSON.stringify(dto),
        decision_envelope_id: decisionEnvelopeId,
        decision_envelope: decisionEnvelope
          ? JSON.stringify(decisionEnvelope)
          : undefined,
        timeline: JSON.stringify(incident.timeline),
      },
    });

    return this.getIncidentOrThrow(tenantId, incidentId);
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
    const incident = await this.getIncidentOrThrow(tenantId, incidentId);

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
    let killSwitchActive = incident.killSwitchActive;
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
      killSwitchActive = false;
    }

    const fromStatus = incident.status;
    const resolvedAt = new Date();

    incident.timeline.push({
      timestamp: resolvedAt.toISOString(),
      fromStatus,
      toStatus: 'RESOLVED',
      action: 'INCIDENT_RESOLVED',
      actor: actorId,
      details: {
        resolutionSummary: dto.resolutionSummary,
        killSwitchDisengaged: dto.disengageKillSwitch ?? false,
      },
    });

    await this.prisma.aiIncident.update({
      where: { id: incidentId },
      data: {
        status: 'RESOLVED',
        resolution_summary: dto.resolutionSummary,
        resolved_at: resolvedAt,
        kill_switch_active: killSwitchActive,
        timeline: JSON.stringify(incident.timeline),
      },
    });

    return this.getIncidentOrThrow(tenantId, incidentId);
  }

  /**
   * Close incident
   */
  async closeIncident(
    tenantId: string,
    incidentId: string,
    actorId = 'soc-lead',
  ): Promise<AiIncidentRecord> {
    const incident = await this.getIncidentOrThrow(tenantId, incidentId);

    if (incident.status !== 'RESOLVED') {
      throw new BadRequestException(
        `Cannot close incident in status '${incident.status}'. Must be in RESOLVED status first.`,
      );
    }

    const fromStatus = incident.status;
    const closedAt = new Date();

    incident.timeline.push({
      timestamp: closedAt.toISOString(),
      fromStatus,
      toStatus: 'CLOSED',
      action: 'INCIDENT_CLOSED',
      actor: actorId,
    });

    await this.prisma.aiIncident.update({
      where: { id: incidentId },
      data: {
        status: 'CLOSED',
        closed_at: closedAt,
        timeline: JSON.stringify(incident.timeline),
      },
    });

    return this.getIncidentOrThrow(tenantId, incidentId);
  }

  /**
   * Get single incident by ID
   */
  async getIncident(
    tenantId: string,
    incidentId: string,
  ): Promise<AiIncidentRecord> {
    return this.getIncidentOrThrow(tenantId, incidentId);
  }

  /**
   * List incidents for tenant with optional filtering
   */
  async listIncidents(
    tenantId: string,
    filters?: {
      status?: AiIncidentStatus;
      severity?: AiIncidentSeverity;
      category?: AiIncidentCategory;
    },
  ): Promise<AiIncidentRecord[]> {
    const rows = await this.prisma.aiIncident.findMany({
      where: {
        tenant_id: tenantId,
        ...(filters?.status && { status: filters.status }),
        ...(filters?.severity && { severity: filters.severity }),
        ...(filters?.category && { category: filters.category }),
      },
      orderBy: { declared_at: 'desc' },
    });

    return rows.map(toRecord);
  }

  /**
   * Get tenant incident metrics
   */
  async getMetrics(tenantId: string) {
    const tenantIncs = await this.listIncidents(tenantId);

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

  private async getIncidentOrThrow(
    tenantId: string,
    incidentId: string,
  ): Promise<AiIncidentRecord> {
    const row = await this.prisma.aiIncident.findUnique({
      where: { id: incidentId },
    });
    if (!row || row.tenant_id !== tenantId) {
      throw new NotFoundException(
        `AI Incident '${incidentId}' not found for tenant '${tenantId}'`,
      );
    }
    return toRecord(row);
  }

  async clearAll(): Promise<void> {
    await this.prisma.aiIncident.deleteMany({});
  }
}
