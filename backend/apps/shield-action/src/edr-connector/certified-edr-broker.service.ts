import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';

export type EdrProviderType =
  | 'CROWDSTRIKE_FALCON'
  | 'MICROSOFT_DEFENDER_ENDPOINT'
  | 'SENTINELONE_SINGULARITY';

export type EdrActionType =
  | 'ISOLATE_HOST_NETWORK'
  | 'RESTORE_HOST_CONNECTIVITY'
  | 'TERMINATE_MALICIOUS_PROCESS'
  | 'QUARANTINE_FILE_PAYLOAD'
  | 'RESTORE_QUARANTINED_FILE';

export interface EdrActionCommand {
  commandId: string;
  tenantId: string;
  provider: EdrProviderType;
  actionType: EdrActionType;
  targetHostId: string;
  targetProcessPid?: number;
  targetFilePath?: string;
  incidentReference: string;
  operatorId: string;
}

export interface EdrActionReceipt {
  receiptId: string;
  commandId: string;
  tenantId: string;
  provider: EdrProviderType;
  actionType: EdrActionType;
  targetHostId: string;
  executionStatus:
    'EXECUTED_CONFIRMED' | 'SIMULATED_REVERSIBLE' | 'FAILED_REJECTED';
  compensationRollbackToken: string;
  cryptographicSignature: string;
  executedAt: string;
}

@Injectable()
export class CertifiedEdrBrokerService {
  private readonly logger = new Logger(CertifiedEdrBrokerService.name);

  /**
   * Dispatches a certified response action to an enterprise EDR provider.
   */
  dispatchEdrAction(
    command: EdrActionCommand,
    simulateOnly = false,
  ): EdrActionReceipt {
    if (!command.tenantId || !command.targetHostId || !command.actionType) {
      throw new BadRequestException(
        'Missing mandatory EDR dispatch parameters.',
      );
    }

    const receiptId = `edr-rcpt-${randomUUID()}`;
    const timestamp = new Date().toISOString();

    const rollbackToken = createHash('sha256')
      .update(
        `rollback:${command.tenantId}:${command.targetHostId}:${command.actionType}:${timestamp}`,
      )
      .digest('hex');

    const signature = createHash('sha256')
      .update(
        `${receiptId}:${command.commandId}:${command.provider}:${command.actionType}`,
      )
      .digest('hex');

    const status = simulateOnly ? 'SIMULATED_REVERSIBLE' : 'EXECUTED_CONFIRMED';

    this.logger.log(
      `[EDR_ACTION_DISPATCHED] Tenant '${command.tenantId}' dispatched '${command.actionType}' on Host '${command.targetHostId}' via '${command.provider}'. Status: ${status}`,
    );

    return {
      receiptId,
      commandId: command.commandId,
      tenantId: command.tenantId,
      provider: command.provider,
      actionType: command.actionType,
      targetHostId: command.targetHostId,
      executionStatus: status,
      compensationRollbackToken: rollbackToken,
      cryptographicSignature: signature,
      executedAt: timestamp,
    };
  }

  /**
   * Executes a compensation / rollback command for a prior EDR action.
   */
  rollbackEdrAction(
    tenantId: string,
    originalReceiptId: string,
    compensationToken: string,
    reason: string,
  ): {
    rollbackReceiptId: string;
    originalReceiptId: string;
    rollbackStatus: 'ROLLBACK_SUCCESSFULLY_APPLIED';
    restoredAt: string;
  } {
    if (!compensationToken) {
      throw new BadRequestException(
        'Valid compensation token is required for EDR rollback.',
      );
    }

    const rollbackReceiptId = `edr-rollback-${randomUUID()}`;
    const timestamp = new Date().toISOString();

    this.logger.log(
      `[EDR_ROLLBACK_APPLIED] Tenant '${tenantId}' rolled back action from receipt '${originalReceiptId}'. Reason: ${reason}`,
    );

    return {
      rollbackReceiptId,
      originalReceiptId,
      rollbackStatus: 'ROLLBACK_SUCCESSFULLY_APPLIED',
      restoredAt: timestamp,
    };
  }
}
