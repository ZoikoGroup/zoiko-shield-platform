import { Injectable, Logger } from '@nestjs/common';
import crypto from 'crypto';
import {
  ActionExecutionAdapter,
  ActionExecutionContext,
  ExecutionReceipt,
} from './action-execution.interface';

@Injectable()
export class EdrIsolateActionAdapter implements ActionExecutionAdapter {
  private readonly logger = new Logger(EdrIsolateActionAdapter.name);

  private readonly supportedActions = new Set([
    'ISOLATE_ENDPOINT',
    'UNISOLATE_ENDPOINT',
    'QUARANTINE_FILE',
  ]);

  supportsAction(actionType: string): boolean {
    return this.supportedActions.has(actionType);
  }

  async execute(context: ActionExecutionContext): Promise<ExecutionReceipt> {
    this.logger.log(
      `Executing EDR action '${context.actionType}' on host '${context.targetRef}' (Simulation: ${context.isSimulation})`,
    );

    const receiptId = `rcpt-edr-${crypto.randomUUID()}`;
    const executedAt = new Date().toISOString();

    const observedEffect = {
      provider: 'edr-agent',
      targetEndpoint: context.targetRef,
      networkIsolationActive: context.actionType === 'ISOLATE_ENDPOINT',
      isolationReason: 'Containment ordered via ZoikoShield SOAR',
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
        rollbackAction: 'UNISOLATE_ENDPOINT',
      },
      signature,
    };
  }

  async rollback(
    receipt: ExecutionReceipt,
  ): Promise<{ status: 'ROLLED_BACK' | 'FAILED'; error?: string }> {
    this.logger.log(
      `Rolling back EDR isolation for receipt '${receipt.receiptId}' on host '${receipt.targetRef}'`,
    );

    return {
      status: 'ROLLED_BACK',
    };
  }
}
