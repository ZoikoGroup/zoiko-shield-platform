import { Injectable, Logger } from '@nestjs/common';
import crypto from 'crypto';
import {
  ActionAuthorityService,
  ResponseAuthorityLevel,
} from '../policy/action-authority.service';
import {
  ActionRollbackBrokerService,
  ActionReceipt,
  CompensatingActionDefinition,
} from '../rollback/action-rollback-broker.service';

export interface PlaybookStepDefinition {
  stepNumber: number;
  actionType: string;
  authorityLevel: ResponseAuthorityLevel;
  targetIdentifier: string;
  parameters: Record<string, unknown>;
  compensatingActionType: string;
}

export interface PlaybookDefinition {
  playbookId: string;
  name: string;
  category:
    | 'RANSOMWARE_CONTAINMENT'
    | 'CREDENTIAL_COMPROMISE'
    | 'DATA_EXFILTRATION_CONTAINMENT';
  steps: PlaybookStepDefinition[];
}

export interface PlaybookStepResult {
  stepNumber: number;
  actionType: string;
  status: 'SUCCESS' | 'FAILED' | 'COMPENSATED';
  receiptId?: string;
  error?: string;
}

export interface PlaybookExecutionReport {
  executionId: string;
  playbookId: string;
  tenantId: string;
  status: 'COMPLETED' | 'FAILED_COMPENSATED';
  totalSteps: number;
  completedSteps: number;
  stepResults: PlaybookStepResult[];
  executedReceiptIds: string[];
  executedAt: Date;
}

@Injectable()
export class ResponsePlaybookService {
  private readonly logger = new Logger(ResponsePlaybookService.name);

  constructor(
    private readonly authorityService: ActionAuthorityService,
    private readonly rollbackBroker: ActionRollbackBrokerService,
  ) {}

  async executePlaybook(params: {
    playbook: PlaybookDefinition;
    tenantId: string;
    approverIds: string[];
    proposalStatus: string;
    stepExecutor?: (
      step: PlaybookStepDefinition,
    ) => Promise<{ success: boolean; error?: string }>;
  }): Promise<PlaybookExecutionReport> {
    const executionId = `pb-exec-${crypto.randomUUID()}`;
    const stepResults: PlaybookStepResult[] = [];
    const createdReceipts: ActionReceipt[] = [];

    this.logger.log(
      `Starting execution of playbook '${params.playbook.name}' [ID: ${executionId}] for tenant '${params.tenantId}'`,
    );

    let playbookFailed = false;

    for (const step of params.playbook.steps) {
      // 1. Target-side authority check
      const auth = this.authorityService.validateAuthority({
        authorityLevel: step.authorityLevel,
        proposalStatus: params.proposalStatus,
        approverIds: params.approverIds,
        actionType: step.actionType,
      });

      if (!auth.allowed) {
        this.logger.error(
          `Authority check failed at step ${step.stepNumber} (${step.actionType}): ${auth.reason}`,
        );
        stepResults.push({
          stepNumber: step.stepNumber,
          actionType: step.actionType,
          status: 'FAILED',
          error: auth.reason,
        });
        playbookFailed = true;
        break;
      }

      // 2. Execute step
      let stepSuccess = true;
      let stepError: string | undefined;

      if (params.stepExecutor) {
        const res = await params.stepExecutor(step);
        stepSuccess = res.success;
        stepError = res.error;
      }

      if (!stepSuccess) {
        this.logger.error(
          `Execution failed at step ${step.stepNumber} (${step.actionType}): ${stepError}`,
        );
        stepResults.push({
          stepNumber: step.stepNumber,
          actionType: step.actionType,
          status: 'FAILED',
          error: stepError,
        });
        playbookFailed = true;
        break;
      }

      // 3. Record receipt and compensating action
      const compensatingAction: CompensatingActionDefinition = {
        actionType: step.compensatingActionType,
        targetIdentifier: step.targetIdentifier,
        parameters: step.parameters,
      };

      const receipt = this.rollbackBroker.recordExecution({
        tenantId: params.tenantId,
        actionCommandId: executionId,
        actionType: step.actionType,
        targetIdentifier: step.targetIdentifier,
        status: 'SUCCESS',
        beforeState: { status: 'INITIAL' },
        afterState: { status: 'CONTAINED' },
        compensatingAction,
      });

      createdReceipts.push(receipt);
      stepResults.push({
        stepNumber: step.stepNumber,
        actionType: step.actionType,
        status: 'SUCCESS',
        receiptId: receipt.receiptId,
      });
    }

    // 4. If any step failed, trigger atomic compensation rollback in reverse order
    if (playbookFailed && createdReceipts.length > 0) {
      this.logger.warn(
        `Playbook execution failed. Rolling back ${createdReceipts.length} previously completed steps...`,
      );
      for (const receipt of [...createdReceipts].reverse()) {
        await this.rollbackBroker.executeRollback(
          params.tenantId,
          receipt.rollbackToken,
        );
        const matched = stepResults.find(
          (r) => r.receiptId === receipt.receiptId,
        );
        if (matched) {
          matched.status = 'COMPENSATED';
        }
      }
    }

    return {
      executionId,
      playbookId: params.playbook.playbookId,
      tenantId: params.tenantId,
      status: playbookFailed ? 'FAILED_COMPENSATED' : 'COMPLETED',
      totalSteps: params.playbook.steps.length,
      completedSteps: playbookFailed ? 0 : stepResults.length,
      stepResults,
      executedReceiptIds: createdReceipts.map((r) => r.receiptId),
      executedAt: new Date(),
    };
  }
}
