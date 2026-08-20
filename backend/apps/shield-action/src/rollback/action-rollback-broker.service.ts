import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import crypto from 'crypto';

export interface CompensatingActionDefinition {
  actionType: string;
  targetIdentifier: string;
  parameters: Record<string, unknown>;
}

export interface ActionReceipt {
  receiptId: string;
  tenantId: string;
  actionCommandId: string;
  actionType: string;
  targetIdentifier: string;
  status: 'SUCCESS' | 'FAILED' | 'ROLLED_BACK';
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
  compensatingAction: CompensatingActionDefinition;
  rollbackToken: string;
  executedAt: Date;
  rolledBackAt?: Date;
}

@Injectable()
export class ActionRollbackBrokerService {
  private readonly logger = new Logger(ActionRollbackBrokerService.name);
  private readonly receipts = new Map<string, ActionReceipt>();
  private readonly tokenToReceiptId = new Map<string, string>();

  recordExecution(params: {
    tenantId: string;
    actionCommandId: string;
    actionType: string;
    targetIdentifier: string;
    status: 'SUCCESS' | 'FAILED';
    beforeState: Record<string, unknown>;
    afterState: Record<string, unknown>;
    compensatingAction: CompensatingActionDefinition;
  }): ActionReceipt {
    const receiptId = `rcpt-${crypto.randomUUID()}`;
    const rollbackToken = `rb-tok-${crypto.randomUUID()}`;

    const receipt: ActionReceipt = {
      receiptId,
      tenantId: params.tenantId,
      actionCommandId: params.actionCommandId,
      actionType: params.actionType,
      targetIdentifier: params.targetIdentifier,
      status: params.status,
      beforeState: params.beforeState,
      afterState: params.afterState,
      compensatingAction: params.compensatingAction,
      rollbackToken,
      executedAt: new Date(),
    };

    this.receipts.set(receiptId, receipt);
    this.tokenToReceiptId.set(rollbackToken, receiptId);

    this.logger.log(
      `Recorded action receipt '${receiptId}' for tenant '${params.tenantId}' [Action: ${params.actionType}, Target: ${params.targetIdentifier}]`,
    );

    return receipt;
  }

  getReceipt(tenantId: string, receiptId: string): ActionReceipt {
    const receipt = this.receipts.get(receiptId);
    if (!receipt || receipt.tenantId !== tenantId) {
      throw new NotFoundException(
        `Action receipt '${receiptId}' not found for tenant '${tenantId}'`,
      );
    }
    return receipt;
  }

  async executeRollback(
    tenantId: string,
    rollbackToken: string,
    executor?: (comp: CompensatingActionDefinition) => Promise<boolean>,
  ): Promise<ActionReceipt> {
    const receiptId = this.tokenToReceiptId.get(rollbackToken);
    if (!receiptId) {
      throw new NotFoundException(
        `Invalid or consumed rollback token '${rollbackToken}'`,
      );
    }

    const receipt = this.getReceipt(tenantId, receiptId);
    if (receipt.status === 'ROLLED_BACK') {
      throw new BadRequestException(
        `Action '${receiptId}' has already been rolled back`,
      );
    }

    this.logger.warn(
      `Executing rollback for action '${receipt.actionType}' on '${receipt.targetIdentifier}' via compensating action '${receipt.compensatingAction.actionType}'`,
    );

    if (executor) {
      await executor(receipt.compensatingAction);
    }

    receipt.status = 'ROLLED_BACK';
    receipt.rolledBackAt = new Date();
    this.receipts.set(receiptId, receipt);
    this.tokenToReceiptId.delete(rollbackToken); // single-use token consumption

    return receipt;
  }
}
