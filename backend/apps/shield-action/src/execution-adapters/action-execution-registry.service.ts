import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ActionExecutionAdapter,
  ActionExecutionContext,
  ExecutionReceipt,
} from './action-execution.interface';
import { EntraUserActionAdapter } from './entra-user.adapter';
import { EdrIsolateActionAdapter } from './edr-isolate.adapter';
import { AwsIamActionAdapter } from './aws-iam.adapter';

@Injectable()
export class ActionExecutionRegistryService {
  private readonly adapters: ActionExecutionAdapter[] = [];

  constructor(
    private readonly entraAdapter: EntraUserActionAdapter,
    private readonly edrAdapter: EdrIsolateActionAdapter,
    private readonly awsIamAdapter: AwsIamActionAdapter,
  ) {
    this.adapters.push(entraAdapter, edrAdapter, awsIamAdapter);
  }

  getAdapter(actionType: string): ActionExecutionAdapter {
    const adapter = this.adapters.find((a) => a.supportsAction(actionType));
    if (!adapter) {
      throw new NotFoundException(
        `No certified action execution adapter registered for action '${actionType}'`,
      );
    }
    return adapter;
  }

  async executeAction(
    context: ActionExecutionContext,
  ): Promise<ExecutionReceipt> {
    const adapter = this.getAdapter(context.actionType);
    return adapter.execute(context);
  }

  async rollbackAction(
    receipt: ExecutionReceipt,
  ): Promise<{ status: 'ROLLED_BACK' | 'FAILED'; error?: string }> {
    const adapter = this.getAdapter(receipt.actionType);
    return adapter.rollback(receipt);
  }
}
