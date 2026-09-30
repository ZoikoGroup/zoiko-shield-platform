import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface PlaybookStepPlan {
  stepNumber: number;
  actionType: string;
  authorityLevel: string;
  targetIdentifier: string;
  compensatingActionType?: string;
}

export interface PlaybookRunSummary {
  id: string;
  caseId: string;
  playbookKey: string;
  playbookOwner: string;
  version: number;
  mode: string;
  status: string;
  triggeredBy: string;
  startedAt: Date;
  completedAt: Date | null;
  terminationReason: string | null;
}

export interface PlaybookRunDetail extends PlaybookRunSummary {
  requiredAuthority: string;
  /**
   * The step plan the run was launched against, not a live execution
   * trace: PlaybookRun does not persist per-step status. A step here
   * being "planned" says nothing about whether it has executed, is
   * waiting on approval, or was rolled back.
   */
  plannedSteps: PlaybookStepPlan[];
}

/**
 * Read model for W18 (Playbook run view). PlaybookDefinition/PlaybookVersion/
 * PlaybookRun (prisma/schemas/response-proposal.prisma) had no backend route
 * until this file - ResponsePlaybookService (shield-action) executes an
 * in-memory playbook shape and never persists to these tables, so there was
 * nothing here to read. This only reads what is actually recorded; it does
 * not simulate step-level execution state that the schema does not carry.
 */
@Injectable()
export class PlaybookRunService {
  constructor(private readonly prisma: PrismaService) {}

  private toSummary(run: {
    id: string;
    case_id: string;
    mode: string;
    status: string;
    triggered_by: string;
    started_at: Date;
    completed_at: Date | null;
    termination_reason: string | null;
    playbookVersion: {
      version: number;
      playbook: { key: string; owner: string };
    };
  }): PlaybookRunSummary {
    return {
      id: run.id,
      caseId: run.case_id,
      playbookKey: run.playbookVersion.playbook.key,
      playbookOwner: run.playbookVersion.playbook.owner,
      version: run.playbookVersion.version,
      mode: run.mode,
      status: run.status,
      triggeredBy: run.triggered_by,
      startedAt: run.started_at,
      completedAt: run.completed_at,
      terminationReason: run.termination_reason,
    };
  }

  private parseSteps(raw: string): PlaybookStepPlan[] {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (step): step is Record<string, unknown> =>
            typeof step === 'object' && step !== null,
        )
        .map((step) => ({
          stepNumber: Number(step.stepNumber ?? 0),
          actionType: String(step.actionType ?? 'UNKNOWN'),
          authorityLevel: String(step.authorityLevel ?? 'R1'),
          targetIdentifier: String(step.targetIdentifier ?? ''),
          compensatingActionType:
            typeof step.compensatingActionType === 'string'
              ? step.compensatingActionType
              : undefined,
        }));
    } catch {
      // Malformed plan data is reported as empty rather than thrown: the run
      // itself is still real, only its step plan failed to parse.
      return [];
    }
  }

  async listForTenant(tenantId: string): Promise<PlaybookRunSummary[]> {
    const runs = await this.prisma.playbookRun.findMany({
      where: { tenant_id: tenantId },
      orderBy: { started_at: 'desc' },
      include: {
        playbookVersion: { include: { playbook: true } },
      },
    });
    return runs.map((run) => this.toSummary(run));
  }

  async getById(tenantId: string, runId: string): Promise<PlaybookRunDetail> {
    const run = await this.prisma.playbookRun.findFirst({
      where: { id: runId, tenant_id: tenantId },
      include: {
        playbookVersion: { include: { playbook: true } },
      },
    });
    if (!run) throw new NotFoundException(`Playbook run '${runId}' not found`);
    return {
      ...this.toSummary(run),
      requiredAuthority: run.playbookVersion.required_authority,
      plannedSteps: this.parseSteps(run.playbookVersion.steps),
    };
  }
}
