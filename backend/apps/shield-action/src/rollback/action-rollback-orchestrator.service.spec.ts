import { ActionRollbackBrokerService } from './action-rollback-broker.service';
import { ActionRollbackOrchestratorService } from './action-rollback-orchestrator.service';
import { ActionExecutionRegistryService } from '../execution-adapters/action-execution-registry.service';
import { EdrIsolateActionAdapter } from '../execution-adapters/edr-isolate.adapter';
import { AwsIamActionAdapter } from '../execution-adapters/aws-iam.adapter';
import { EntraUserActionAdapter } from '../execution-adapters/entra-user.adapter';

describe('ActionRollbackOrchestratorService', () => {
  let broker: ActionRollbackBrokerService;
  let registry: ActionExecutionRegistryService;
  let orchestrator: ActionRollbackOrchestratorService;

  beforeEach(() => {
    broker = new ActionRollbackBrokerService();
    registry = new ActionExecutionRegistryService(
      new EntraUserActionAdapter(),
      new EdrIsolateActionAdapter(),
      new AwsIamActionAdapter(),
    );
    orchestrator = new ActionRollbackOrchestratorService(broker, registry);
  });

  it('should orchestrate endpoint un-isolation rollback successfully', async () => {
    const tenantId = 'tenant-soc-01';
    const hostName = 'srv-app-prod-02';

    // 1. Record original quarantine action
    const receipt = broker.recordExecution({
      tenantId,
      actionCommandId: 'cmd-quarantine-01',
      actionType: 'ISOLATE_ENDPOINT',
      targetIdentifier: hostName,
      status: 'SUCCESS',
      beforeState: { networkConnected: true },
      afterState: { networkConnected: false, isolated: true },
      compensatingAction: {
        actionType: 'UNISOLATE_ENDPOINT',
        targetIdentifier: hostName,
        parameters: {},
      },
    });

    expect(receipt.status).toBe('SUCCESS');
    expect(receipt.rollbackToken).toBeDefined();

    // 2. Orchestrate compensating rollback
    const rollbackResult = await orchestrator.orchestrateRollback(
      tenantId,
      receipt.rollbackToken,
    );

    expect(rollbackResult.status).toBe('ROLLED_BACK');
    expect(rollbackResult.originalActionType).toBe('ISOLATE_ENDPOINT');
    expect(rollbackResult.compensatingActionType).toBe('UNISOLATE_ENDPOINT');
    expect(rollbackResult.compensatingExecutionReceipt.status).toBe('EXECUTED');
    expect(
      (rollbackResult.compensatingExecutionReceipt.observedEffect as any)
        .networkIsolationActive,
    ).toBe(false);
  });

  it('should orchestrate Microsoft Entra account re-enablement rollback', async () => {
    const tenantId = 'tenant-soc-02';
    const userUpn = 'compromised-analyst@enterprise.com';

    const receipt = broker.recordExecution({
      tenantId,
      actionCommandId: 'cmd-entra-lockout-01',
      actionType: 'DISABLE_USER_ACCOUNT',
      targetIdentifier: userUpn,
      status: 'SUCCESS',
      beforeState: { accountEnabled: true },
      afterState: { accountEnabled: false },
      compensatingAction: {
        actionType: 'ENABLE_USER_ACCOUNT',
        targetIdentifier: userUpn,
        parameters: {},
      },
    });

    const rollbackResult = await orchestrator.orchestrateRollback(
      tenantId,
      receipt.rollbackToken,
    );

    expect(rollbackResult.status).toBe('ROLLED_BACK');
    expect(rollbackResult.compensatingActionType).toBe('ENABLE_USER_ACCOUNT');
    expect(
      (rollbackResult.compensatingExecutionReceipt.observedEffect as any)
        .accountEnabled,
    ).toBe(true);
  });
});
