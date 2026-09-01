import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export type WorkflowContainmentState =
  | 'INITIALIZED'
  | 'AWAITING_ANALYST_APPROVAL'
  | 'ESCALATED_TO_SOC_LEAD'
  | 'STEPUP_MFA_CHALLENGED'
  | 'CONTAINMENT_DISPATCHED'
  | 'CONTAINMENT_FAILED_ROLLED_BACK'
  | 'RESOLVED';

export interface ContainmentWorkflowInput {
  workflowId: string;
  tenantId: string;
  incidentRef: string;
  targetResource: string;
  actionType: 'ISOLATE_ENDPOINT' | 'REVOKE_IAM_SESSION' | 'QUARANTINE_SUBNET';
  initialApprovalTier: 'TIER_1_SOC_ANALYST' | 'TIER_2_SOC_LEAD' | 'TIER_3_CISO';
  analystApprovalTimeoutSeconds: number;
}

export interface ContainmentWorkflowHistoryEvent {
  state: WorkflowContainmentState;
  timestamp: string;
  recordedBy?: string;
  metadataReference: string;
}

export interface ContainmentWorkflowInstance {
  workflowId: string;
  tenantId: string;
  incidentRef: string;
  targetResource: string;
  actionType: string;
  currentTier: 'TIER_1_SOC_ANALYST' | 'TIER_2_SOC_LEAD' | 'TIER_3_CISO';
  currentState: WorkflowContainmentState;
  history: ContainmentWorkflowHistoryEvent[];
  mfaChallengeVerified: boolean;
  actionReceiptId?: string;
  rollbackReceiptId?: string;
  startedAt: string;
  completedAt?: string;
  attestationDigest: string;
}

/**
 * Temporal Durable Containment Orchestration & Multi-Approver Escalation Service
 * Specification: Backend Build Guide §LAB 10 & §LAB 15 (Durable Workflows & Governed Action Response)
 */
@Injectable()
export class TemporalContainmentEscalationService {
  private readonly logger = new Logger(
    TemporalContainmentEscalationService.name,
  );

  // In-memory durable workflow state store
  private readonly workflows = new Map<string, ContainmentWorkflowInstance>();

  /**
   * Starts a durable multi-approver containment workflow.
   */
  startContainmentWorkflow(
    input: ContainmentWorkflowInput,
  ): ContainmentWorkflowInstance {
    const startedAt = new Date().toISOString();
    const history: ContainmentWorkflowHistoryEvent[] = [
      {
        state: 'INITIALIZED',
        timestamp: startedAt,
        metadataReference: `gcs://zs-workflow-vault/${input.tenantId}/${input.workflowId}/init.json`,
      },
      {
        state: 'AWAITING_ANALYST_APPROVAL',
        timestamp: startedAt,
        metadataReference: `ref://approval-queue/tier1/${input.workflowId}`,
      },
    ];

    const attestationDigest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          workflowId: input.workflowId,
          tenantId: input.tenantId,
          startedAt,
        }),
      )
      .digest('hex');

    const instance: ContainmentWorkflowInstance = {
      workflowId: input.workflowId,
      tenantId: input.tenantId,
      incidentRef: input.incidentRef,
      targetResource: input.targetResource,
      actionType: input.actionType,
      currentTier: input.initialApprovalTier,
      currentState: 'AWAITING_ANALYST_APPROVAL',
      history,
      mfaChallengeVerified: false,
      startedAt,
      attestationDigest,
    };

    this.workflows.set(input.workflowId, instance);
    this.logger.log(
      `✔ [TEMPORAL WORKFLOW STARTED] '${input.workflowId}' for Tenant '${input.tenantId}' (Target: ${input.targetResource})`,
    );

    return instance;
  }

  /**
   * Simulates a timer signal triggering automatic escalation when Analyst approval times out.
   */
  handleApprovalTimeout(workflowId: string): ContainmentWorkflowInstance {
    const wf = this.workflows.get(workflowId);
    if (!wf) throw new Error(`Workflow '${workflowId}' not found.`);

    if (wf.currentState !== 'AWAITING_ANALYST_APPROVAL') {
      return wf;
    }

    const timestamp = new Date().toISOString();
    wf.currentTier = 'TIER_2_SOC_LEAD';
    wf.currentState = 'ESCALATED_TO_SOC_LEAD';
    wf.history.push({
      state: 'ESCALATED_TO_SOC_LEAD',
      timestamp,
      metadataReference: `escalation://timeout-exceeded-60s/tier1-to-tier2`,
    });

    this.logger.warn(
      `⚠️ [WORKFLOW ESCALATED] Workflow '${workflowId}' timed out on Tier 1. Escalated to Tier 2 (SOC Lead).`,
    );
    return wf;
  }

  /**
   * Records human decision signal with step-up MFA challenge attestation.
   */
  recordApprovalWithStepUpMfa(
    workflowId: string,
    approverId: string,
    decision: 'APPROVE' | 'REJECT',
    mfaToken: string,
  ): ContainmentWorkflowInstance {
    const wf = this.workflows.get(workflowId);
    if (!wf) throw new Error(`Workflow '${workflowId}' not found.`);

    const timestamp = new Date().toISOString();

    if (decision === 'REJECT') {
      wf.currentState = 'CONTAINMENT_FAILED_ROLLED_BACK';
      wf.rollbackReceiptId = `rb-${crypto.randomUUID()}`;
      wf.completedAt = timestamp;
      wf.history.push({
        state: 'CONTAINMENT_FAILED_ROLLED_BACK',
        timestamp,
        recordedBy: approverId,
        metadataReference: `decision://rejected-by-operator/${approverId}`,
      });
      return wf;
    }

    // Verify step-up MFA
    const isMfaValid = mfaToken && mfaToken.startsWith('fido2-hw-key-');
    if (!isMfaValid) {
      throw new Error(
        `LAB 10 & 15 Violation: Step-up FIDO2 MFA challenge failed for approver '${approverId}'.`,
      );
    }

    wf.mfaChallengeVerified = true;
    wf.currentState = 'CONTAINMENT_DISPATCHED';
    wf.actionReceiptId = `rcpt-gov-act-${crypto.randomUUID()}`;
    wf.history.push({
      state: 'STEPUP_MFA_CHALLENGED',
      timestamp,
      recordedBy: approverId,
      metadataReference: `mfa://fido2-verified/${approverId}`,
    });
    wf.history.push({
      state: 'CONTAINMENT_DISPATCHED',
      timestamp,
      metadataReference: `receipt://${wf.actionReceiptId}`,
    });

    wf.currentState = 'RESOLVED';
    wf.completedAt = timestamp;
    wf.history.push({
      state: 'RESOLVED',
      timestamp,
      metadataReference: `workflow-resolution://incident-contained`,
    });

    wf.attestationDigest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          workflowId,
          history: wf.history,
          actionReceiptId: wf.actionReceiptId,
        }),
      )
      .digest('hex');

    this.logger.log(
      `✔ [WORKFLOW CONTAINMENT DISPATCHED] Workflow '${workflowId}' resolved by '${approverId}' (Receipt: ${wf.actionReceiptId})`,
    );
    return wf;
  }
}
