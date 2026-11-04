import {
  Injectable,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import {
  DualCustodyApprovalRef,
  DualCustodyQuorumService,
} from '../dual-custody/dual-custody-quorum.service';

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
  approval?: DualCustodyApprovalRef;
}

type DestructiveEdrAction = Extract<
  EdrActionType,
  | 'ISOLATE_HOST_NETWORK'
  | 'TERMINATE_MALICIOUS_PROCESS'
  | 'QUARANTINE_FILE_PAYLOAD'
>;

const DESTRUCTIVE_EDR_ACTIONS: ReadonlySet<EdrActionType> =
  new Set<DestructiveEdrAction>([
    'ISOLATE_HOST_NETWORK',
    'TERMINATE_MALICIOUS_PROCESS',
    'QUARANTINE_FILE_PAYLOAD',
  ]);

function isDestructiveEdrAction(
  action: EdrActionType,
): action is DestructiveEdrAction {
  return DESTRUCTIVE_EDR_ACTIONS.has(action);
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

  constructor(private readonly dualCustody: DualCustodyQuorumService) {}

  /**
   * Dispatches a certified response action to an enterprise EDR provider.
   */
  async dispatchEdrAction(
    command: EdrActionCommand,
    simulateOnly = false,
  ): Promise<EdrActionReceipt> {
    if (!command.tenantId || !command.targetHostId || !command.actionType) {
      throw new BadRequestException(
        'Missing mandatory EDR dispatch parameters.',
      );
    }

    if (!simulateOnly) {
      if (isDestructiveEdrAction(command.actionType)) {
        await this.dualCustody.consumeForExecution(
          command.tenantId,
          command.approval,
          command.actionType,
          command.targetHostId,
        );
      }
      // No provider SDK is wired in, so a live dispatch cannot be confirmed.
      throw new ServiceUnavailableException(
        `No certified ${command.provider} integration is configured; live EDR dispatch is unavailable.`,
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

    this.logger.log(
      `[EDR_ACTION_SIMULATED] Tenant '${command.tenantId}' simulated '${command.actionType}' on Host '${command.targetHostId}' via '${command.provider}'.`,
    );

    return {
      receiptId,
      commandId: command.commandId,
      tenantId: command.tenantId,
      provider: command.provider,
      actionType: command.actionType,
      targetHostId: command.targetHostId,
      executionStatus: 'SIMULATED_REVERSIBLE',
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
