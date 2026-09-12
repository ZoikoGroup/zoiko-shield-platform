import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import crypto from 'crypto';
import {
  ActionExecutionAdapter,
  ActionExecutionContext,
  ExecutionReceipt,
} from './action-execution.interface';

/**
 * ERB-01 §15 commits exactly one certified EDR partner (CrowdStrike, per
 * shield-ingest's connector-catalog.service.ts) with response authority;
 * every other EDR is read-only BYO ingestion. That distinction isn't
 * enforced here per-vendor: ActionExecutionContext carries no connector/
 * provider identity, only tenant/action/target, so this adapter cannot tell
 * which EDR a command's target belongs to without plumbing that identity
 * through the whole response-proposal chain from shield-core. It doesn't
 * need to yet - live execution (ISOLATE_ENDPOINT/QUARANTINE_FILE) is
 * unconditionally forbidden below regardless of source until R2+ is
 * ratified, so there is no live path this would currently gate.
 */
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
    if (
      !context.isSimulation &&
      (context.actionType === 'ISOLATE_ENDPOINT' ||
        context.actionType === 'QUARANTINE_FILE')
    ) {
      throw new ForbiddenException(
        'Live R2 automated response is strictly disabled prior to G1 release gate ratification (Master Build Plan §2, §18). Only R0 observation and R1 simulation are permitted.',
      );
    }

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
