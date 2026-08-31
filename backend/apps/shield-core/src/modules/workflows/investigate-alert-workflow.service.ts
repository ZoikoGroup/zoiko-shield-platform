import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export type WorkflowState =
  | 'INITIALIZED'
  | 'GATHERING_EVIDENCE'
  | 'EVALUATING_PLAYBOOK'
  | 'AWAITING_HUMAN_DECISION'
  | 'RESOLVED'
  | 'CLOSED';

export interface InvestigationInput {
  workflowId: string;
  tenantId: string;
  alertCandidateId: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  evidenceOpaquePointers: string[]; // Opaque pointers only, never raw customer payloads (LAB 10)
  targetResource: string;
}

export interface HumanDecisionSignal {
  decisionId: string;
  workflowId: string;
  tenantId: string;
  authorizingPrincipal: string;
  verdict: 'APPROVE_CONTAINMENT' | 'DISMISS_FALSE_POSITIVE' | 'ESCALATE_TO_SOC_TIER3';
  rationale: string;
  timestamp: string;
}

export interface InvestigationResult {
  workflowId: string;
  tenantId: string;
  status: WorkflowState;
  finalVerdict: string;
  executedActions: string[];
  evidencePointers: string[];
  historyRecordCount: number;
  completedAt: string;
  attestationDigest: string;
}

/**
 * Temporal Durable Case Investigation Workflow & State Machine
 * Specification: Backend Build Guide §LAB 10 (Temporal Case and Evidence Workflows)
 */
@Injectable()
export class InvestigateAlertWorkflowService {
  private readonly logger = new Logger(InvestigateAlertWorkflowService.name);

  // In-memory durable workflow state store: Map<workflowId, state>
  private readonly workflowStore = new Map<
    string,
    {
      input: InvestigationInput;
      state: WorkflowState;
      history: Array<{ transition: string; timestamp: string; reference: string }>;
      humanDecision?: HumanDecisionSignal;
      executedActions: string[];
      createdAt: string;
      updatedAt: string;
    }
  >();

  /**
   * Executes or resumes the durable case investigation workflow.
   */
  startWorkflow(input: InvestigationInput): { workflowId: string; state: WorkflowState } {
    // Check idempotency
    if (this.workflowStore.has(input.workflowId)) {
      const existing = this.workflowStore.get(input.workflowId)!;
      this.logger.log(`✔ Resuming existing workflow '${input.workflowId}' in state: ${existing.state}`);
      return { workflowId: input.workflowId, state: existing.state };
    }

    const now = new Date().toISOString();
    const history = [
      {
        transition: 'INITIALIZED -> GATHERING_EVIDENCE',
        timestamp: now,
        reference: `alert:${input.alertCandidateId}`,
      },
    ];

    // Activity: Aggregate opaque evidence pointers
    history.push({
      transition: 'GATHERING_EVIDENCE -> EVALUATING_PLAYBOOK',
      timestamp: new Date().toISOString(),
      reference: `evidence_pointers:${input.evidenceOpaquePointers.length}`,
    });

    let nextState: WorkflowState = 'AWAITING_HUMAN_DECISION';
    if (input.severity === 'LOW') {
      // Auto-resolve low severity without human disruption
      nextState = 'RESOLVED';
    }

    history.push({
      transition: `EVALUATING_PLAYBOOK -> ${nextState}`,
      timestamp: new Date().toISOString(),
      reference: `severity:${input.severity}`,
    });

    this.workflowStore.set(input.workflowId, {
      input,
      state: nextState,
      history,
      executedActions: nextState === 'RESOLVED' ? ['AUTO_SUPPRESS_AND_LOG'] : [],
      createdAt: now,
      updatedAt: new Date().toISOString(),
    });

    this.logger.log(
      `✔ Started Temporal Case Workflow '${input.workflowId}' for Tenant '${input.tenantId}' (State: ${nextState})`,
    );

    return { workflowId: input.workflowId, state: nextState };
  }

  /**
   * Temporal Signal Method: Receives external asynchronous human approval/dismissal.
   */
  recordHumanDecision(signal: HumanDecisionSignal): InvestigationResult {
    const workflow = this.workflowStore.get(signal.workflowId);
    if (!workflow) {
      throw new Error(`Workflow with ID '${signal.workflowId}' not found.`);
    }

    workflow.humanDecision = signal;
    const now = new Date().toISOString();

    if (signal.verdict === 'APPROVE_CONTAINMENT') {
      workflow.state = 'RESOLVED';
      workflow.executedActions.push('EXECUTE_ISOLATE_ENDPOINT_PLAYBOOK');
    } else if (signal.verdict === 'DISMISS_FALSE_POSITIVE') {
      workflow.state = 'CLOSED';
      workflow.executedActions.push('TAG_FALSE_POSITIVE_TUNING');
    } else {
      workflow.state = 'AWAITING_HUMAN_DECISION';
      workflow.executedActions.push('ESCALATE_TIER_3_ONCALL');
    }

    workflow.history.push({
      transition: `HUMAN_DECISION_RECEIVED -> ${workflow.state}`,
      timestamp: now,
      reference: `decision:${signal.decisionId}|actor:${signal.authorizingPrincipal}`,
    });
    workflow.updatedAt = now;

    const attestationDigest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          workflowId: workflow.input.workflowId,
          state: workflow.state,
          verdict: signal.verdict,
          historyCount: workflow.history.length,
          completedAt: now,
        }),
      )
      .digest('hex');

    this.logger.log(
      `✔ Recorded Human Decision for Workflow '${signal.workflowId}': ${signal.verdict} by ${signal.authorizingPrincipal} -> State: ${workflow.state}`,
    );

    return {
      workflowId: workflow.input.workflowId,
      tenantId: workflow.input.tenantId,
      status: workflow.state,
      finalVerdict: signal.verdict,
      executedActions: workflow.executedActions,
      evidencePointers: workflow.input.evidenceOpaquePointers,
      historyRecordCount: workflow.history.length,
      completedAt: now,
      attestationDigest,
    };
  }

  getWorkflowStatus(workflowId: string) {
    return this.workflowStore.get(workflowId);
  }
}
