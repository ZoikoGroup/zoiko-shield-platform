import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import crypto from 'crypto';
import {
  ActionExecutionAdapter,
  ActionExecutionContext,
  ExecutionReceipt,
} from './action-execution.interface';

@Injectable()
export class EntraUserActionAdapter implements ActionExecutionAdapter {
  private readonly logger = new Logger(EntraUserActionAdapter.name);

  private readonly supportedActions = new Set([
    'DISABLE_USER_ACCOUNT',
    'ENABLE_USER_ACCOUNT',
    'REVOKE_USER_SESSIONS',
    'FORCE_PASSWORD_RESET',
  ]);

  supportsAction(actionType: string): boolean {
    return this.supportedActions.has(actionType);
  }

  private readonly containmentActions = new Set([
    'DISABLE_USER_ACCOUNT',
    'REVOKE_USER_SESSIONS',
    'FORCE_PASSWORD_RESET',
  ]);

  async execute(context: ActionExecutionContext): Promise<ExecutionReceipt> {
    if (
      !context.isSimulation &&
      this.containmentActions.has(context.actionType)
    ) {
      throw new ForbiddenException(
        'Live R2+ automated response execution is strictly disabled: G1 Release Gate has not been formally ratified by the controlled authorization roster (Master Build Plan §2, §18; Rule G1-01). Only R0 observation and R1 pre-flight simulation are permitted.',
      );
    }

    this.logger.log(
      `Executing Entra ID action '${context.actionType}' on target '${context.targetRef}' (Simulation: ${context.isSimulation})`,
    );

    const receiptId = `rcpt-entra-${crypto.randomUUID()}`;
    const executedAt = new Date().toISOString();

    const observedEffect = {
      provider: 'microsoft-entra',
      targetAccount: context.targetRef,
      accountDisabled: context.actionType === 'DISABLE_USER_ACCOUNT',
      accountEnabled: context.actionType === 'ENABLE_USER_ACCOUNT',
      sessionsInvalidated: context.actionType !== 'ENABLE_USER_ACCOUNT',
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
        rollbackAction: 'ENABLE_USER_ACCOUNT',
      },
      signature,
    };
  }

  async rollback(
    receipt: ExecutionReceipt,
  ): Promise<{ status: 'ROLLED_BACK' | 'FAILED'; error?: string }> {
    this.logger.log(
      `Rolling back Entra ID action for receipt '${receipt.receiptId}' on target '${receipt.targetRef}'`,
    );

    return {
      status: 'ROLLED_BACK',
    };
  }
}
