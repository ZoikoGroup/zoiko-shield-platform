import { ActionRollbackBrokerService } from './action-rollback-broker.service';
import { ActionRollbackOrchestratorService } from './action-rollback-orchestrator.service';
import { ActionExecutionRegistryService } from '../execution-adapters/action-execution-registry.service';
import { EdrIsolateActionAdapter } from '../execution-adapters/edr-isolate.adapter';
import { AwsIamActionAdapter } from '../execution-adapters/aws-iam.adapter';
import { WafIpActionAdapter } from '../execution-adapters/waf-ip.adapter';
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
      new WafIpActionAdapter(),
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
    // The original was recorded without a mode, so it counts as simulated,
    // and its rollback must be simulated too - never a live write.
    expect(rollbackResult.compensatingExecutionReceipt.status).toBe(
      'SIMULATED',
    );
    expect(
      (rollbackResult.compensatingExecutionReceipt.observedEffect as any)
        .executionMode,
    ).toBe('SIMULATED');
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

  // Spec G1 fail-closed rule: no live response path before the G1 decision is
  // recorded. Compensating actions are live writes too.
  it('refuses to roll back a LIVE action while G1 is unratified, and keeps the token usable', async () => {
    const tenantId = 'tenant-soc-03';
    const receipt = broker.recordExecution({
      tenantId,
      actionCommandId: 'cmd-live-01',
      actionType: 'DISABLE_USER_ACCOUNT',
      targetIdentifier: 'user@enterprise.com',
      status: 'SUCCESS',
      beforeState: { accountEnabled: true },
      afterState: { accountEnabled: false },
      compensatingAction: {
        actionType: 'ENABLE_USER_ACCOUNT',
        targetIdentifier: 'user@enterprise.com',
        parameters: {},
      },
      executionMode: 'LIVE',
    });

    await expect(
      orchestrator.orchestrateRollback(tenantId, receipt.rollbackToken),
    ).rejects.toThrow(/G1 Release Gate has not been formally ratified/);

    // A refused rollback must not be recorded as done, and the single-use
    // token must survive so the rollback can be retried once G1 is ratified.
    expect(broker.getReceipt(tenantId, receipt.receiptId).status).toBe(
      'SUCCESS',
    );
    await expect(
      orchestrator.orchestrateRollback(tenantId, receipt.rollbackToken),
    ).rejects.toThrow(/G1 Release Gate/);
  });

  it('records actions as SIMULATED unless explicitly marked LIVE', () => {
    const receipt = broker.recordExecution({
      tenantId: 't',
      actionCommandId: 'c',
      actionType: 'ISOLATE_ENDPOINT',
      targetIdentifier: 'h',
      status: 'SUCCESS',
      beforeState: {},
      afterState: {},
      compensatingAction: {
        actionType: 'UNISOLATE_ENDPOINT',
        targetIdentifier: 'h',
        parameters: {},
      },
    });
    expect(receipt.executionMode).toBe('SIMULATED');
  });
});
