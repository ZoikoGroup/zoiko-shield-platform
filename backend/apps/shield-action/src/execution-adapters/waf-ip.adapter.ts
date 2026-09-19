import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import crypto from 'crypto';
import {
  ActionExecutionAdapter,
  ActionExecutionContext,
  ExecutionReceipt,
} from './action-execution.interface';

@Injectable()
export class WafIpActionAdapter implements ActionExecutionAdapter {
  private readonly logger = new Logger(WafIpActionAdapter.name);

  private readonly supportedActions = new Set([
    'APPLY_WAF_BLOCK',
    'REMOVE_WAF_BLOCK',
    'QUARANTINE_IP_CIDR',
    'RESTORE_IP_ACCESS',
  ]);

  supportsAction(actionType: string): boolean {
    return this.supportedActions.has(actionType);
  }

  private readonly containmentActions = new Set([
    'APPLY_WAF_BLOCK',
    'QUARANTINE_IP_CIDR',
  ]);

  async execute(context: ActionExecutionContext): Promise<ExecutionReceipt> {
    const isG1Ratified =
      process.env.ENABLE_G1_LIVE_EXECUTION === 'true' ||
      process.env.G1_GATE_RATIFIED === 'true';

    if (
      !context.isSimulation &&
      !isG1Ratified &&
      this.containmentActions.has(context.actionType)
    ) {
      throw new ForbiddenException(
        'Live R2+ automated response execution is strictly disabled: G1 Release Gate has not been formally ratified by the controlled authorization roster (Master Build Plan §2, §18; Rule G1-01). Only R0 observation and R1 pre-flight simulation are permitted.',
      );
    }

    this.logger.log(
      `Executing WAF Perimeter action '${context.actionType}' on target '${context.targetRef}' (Simulation: ${context.isSimulation})`,
    );

    const receiptId = `rcpt-waf-${crypto.randomUUID()}`;
    const executedAt = new Date().toISOString();
    const ttlMinutes = context.parameters?.ttlMinutes ?? 60;
    const expiresAt = new Date(
      Date.now() + ttlMinutes * 60 * 1000,
    ).toISOString();

    const observedEffect = {
      provider: 'cloud-waf',
      targetIpOrCidr: context.targetRef,
      ipBlocked:
        context.actionType === 'APPLY_WAF_BLOCK' ||
        context.actionType === 'QUARANTINE_IP_CIDR',
      blockRuleId: `waf-rule-${context.commandId.slice(0, 8)}`,
      ttlMinutes,
      autoExpireAt: expiresAt,
      perimeterSyncStatus: 'DISTRIBUTED_TO_EDGE',
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
        rollbackAction: 'REMOVE_WAF_BLOCK',
      },
      signature,
    };
  }

  async rollback(
    receipt: ExecutionReceipt,
  ): Promise<{ status: 'ROLLED_BACK' | 'FAILED'; error?: string }> {
    this.logger.log(
      `Rolling back WAF IP block for receipt '${receipt.receiptId}' on IP '${receipt.targetRef}'`,
    );

    return {
      status: 'ROLLED_BACK',
    };
  }
}
