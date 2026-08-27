import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ActionRollbackBrokerService, ActionReceipt } from './action-rollback-broker.service';
import { ActionExecutionRegistryService } from '../execution-adapters/action-execution-registry.service';
import { ExecutionReceipt } from '../execution-adapters/action-execution.interface';

export interface RollbackExecutionResult {
  receiptId: string;
  originalActionType: string;
  compensatingActionType: string;
  targetIdentifier: string;
  status: 'ROLLED_BACK' | 'FAILED';
  compensatingExecutionReceipt: ExecutionReceipt;
  rolledBackAt: Date;
}

@Injectable()
export class ActionRollbackOrchestratorService {
  private readonly logger = new Logger(ActionRollbackOrchestratorService.name);

  constructor(
    private readonly rollbackBroker: ActionRollbackBrokerService,
    private readonly executionRegistry: ActionExecutionRegistryService,
  ) {}

  /**
   * Orchestrates the execution of a rollback for a previously recorded action receipt.
   * Resolves the corresponding execution adapter and runs the compensating action.
   */
  async orchestrateRollback(
    tenantId: string,
    rollbackToken: string,
    environmentId: string = 'production',
  ): Promise<RollbackExecutionResult> {
    this.logger.log(`Initiating rollback orchestration for tenant=${tenantId} using token=${rollbackToken}`);

    let executedReceipt: ExecutionReceipt | null = null;

    const actionReceipt = await this.rollbackBroker.executeRollback(
      tenantId,
      rollbackToken,
      async (compensatingAction) => {
        const adapter = this.executionRegistry.getAdapter(compensatingAction.actionType);

        if (!adapter) {
          throw new BadRequestException(
            `No execution adapter registered to handle compensating action '${compensatingAction.actionType}'`,
          );
        }

        executedReceipt = await adapter.execute({
          commandId: `cmd-rollback-${Date.now()}`,
          tenantId,
          environmentId,
          actionType: compensatingAction.actionType,
          targetRef: compensatingAction.targetIdentifier,
          parameters: compensatingAction.parameters,
          isSimulation: false,
        });

        this.logger.log(
          `Successfully executed compensating action '${compensatingAction.actionType}' on '${compensatingAction.targetIdentifier}'`,
        );

        return true;
      },
    );

    if (!executedReceipt) {
      throw new Error('Rollback execution failed to produce an execution receipt');
    }

    return {
      receiptId: actionReceipt.receiptId,
      originalActionType: actionReceipt.actionType,
      compensatingActionType: actionReceipt.compensatingAction.actionType,
      targetIdentifier: actionReceipt.targetIdentifier,
      status: 'ROLLED_BACK',
      compensatingExecutionReceipt: executedReceipt,
      rolledBackAt: actionReceipt.rolledBackAt || new Date(),
    };
  }
}
