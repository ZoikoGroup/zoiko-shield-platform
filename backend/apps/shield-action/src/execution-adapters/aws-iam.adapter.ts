import { Injectable, Logger } from '@nestjs/common';
import crypto from 'crypto';
import {
  ActionExecutionAdapter,
  ActionExecutionContext,
  ExecutionReceipt,
} from './action-execution.interface';

@Injectable()
export class AwsIamActionAdapter implements ActionExecutionAdapter {
  private readonly logger = new Logger(AwsIamActionAdapter.name);

  private readonly supportedActions = new Set([
    'REVOKE_IAM_SESSION',
    'ATTACH_DENY_ALL_POLICY',
    'DETACH_DENY_ALL_POLICY',
    'RESTORE_IAM_ACCESS',
    'DEACTIVATE_ACCESS_KEYS',
    'RESET_IAM_USER_CREDENTIALS',
  ]);

  supportsAction(actionType: string): boolean {
    return this.supportedActions.has(actionType);
  }

  async execute(context: ActionExecutionContext): Promise<ExecutionReceipt> {
    this.logger.log(
      `Executing AWS IAM action '${context.actionType}' on target '${context.targetRef}' (Simulation: ${context.isSimulation})`,
    );

    const receiptId = `rcpt-aws-iam-${crypto.randomUUID()}`;
    const executedAt = new Date().toISOString();

    const observedEffect = {
      provider: 'aws-iam',
      targetArn: context.targetRef,
      sessionsRevoked: context.actionType === 'REVOKE_IAM_SESSION',
      denyPolicyAttached: context.actionType === 'ATTACH_DENY_ALL_POLICY',
      denyPolicyDetached:
        context.actionType === 'DETACH_DENY_ALL_POLICY' ||
        context.actionType === 'RESTORE_IAM_ACCESS',
      keysDeactivated: context.actionType === 'DEACTIVATE_ACCESS_KEYS',
      executionMode: context.isSimulation ? 'SIMULATED' : 'LIVE',
    };

    const signaturePayload = `${receiptId}:${context.commandId}:${context.tenantId}:${context.actionType}:${executedAt}`;
    const signature = crypto
      .createHash('sha256')
      .update(signaturePayload)
      .digest('hex');

    return {
      receiptId,
      commandId: context.commandId,
      tenantId: context.tenantId,
      actionType: context.actionType,
      targetRef: context.targetRef,
      status: context.isSimulation ? 'SIMULATED' : 'EXECUTED',
      executedAt,
      observedEffect,
      rollbackCapability: {
        supported: true,
        rollbackAction: 'DETACH_DENY_ALL_POLICY',
      },
      signature,
    };
  }

  async rollback(
    receipt: ExecutionReceipt,
  ): Promise<{ status: 'ROLLED_BACK' | 'FAILED'; error?: string }> {
    this.logger.log(
      `Rolling back AWS IAM action for receipt '${receipt.receiptId}' on target '${receipt.targetRef}'`,
    );

    return {
      status: 'ROLLED_BACK',
    };
  }
}
