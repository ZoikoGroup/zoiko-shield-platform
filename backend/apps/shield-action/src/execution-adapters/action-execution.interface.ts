export interface ActionExecutionContext {
  tenantId: string;
  environmentId?: string;
  commandId: string;
  actionType: string;
  targetRef: string;
  authorityLevel?: 'R0' | 'R1' | 'R2' | 'R3' | 'R4';
  approvalRef?: string;
  parameters?: Record<string, any>;
  isSimulation: boolean;
}

export interface ExecutionReceipt {
  receiptId: string;
  commandId: string;
  tenantId: string;
  actionType: string;
  targetRef: string;
  status: 'EXECUTED' | 'SIMULATED' | 'FAILED' | 'REVERTED';
  executedAt: string;
  observedEffect: Record<string, any>;
  rollbackCapability: {
    supported: boolean;
    rollbackAction?: string;
  };
  signature: string;
}

export interface ActionExecutionAdapter {
  supportsAction(actionType: string): boolean;
  execute(context: ActionExecutionContext): Promise<ExecutionReceipt>;
  rollback(
    receipt: ExecutionReceipt,
  ): Promise<{ status: 'ROLLED_BACK' | 'FAILED'; error?: string }>;
}
