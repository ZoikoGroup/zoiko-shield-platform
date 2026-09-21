import { Test, TestingModule } from '@nestjs/testing';
import { ActionExecutionRegistryService } from './action-execution-registry.service';
import { EntraUserActionAdapter } from './entra-user.adapter';
import { EdrIsolateActionAdapter } from './edr-isolate.adapter';
import { AwsIamActionAdapter } from './aws-iam.adapter';
import { WafIpActionAdapter } from './waf-ip.adapter';
import { ActionExecutionContext } from './action-execution.interface';

describe('ActionExecutionRegistry & Adapters', () => {
  let registry: ActionExecutionRegistryService;
  let entraAdapter: EntraUserActionAdapter;
  let edrAdapter: EdrIsolateActionAdapter;
  let awsIamAdapter: AwsIamActionAdapter;
  let wafIpAdapter: WafIpActionAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActionExecutionRegistryService,
        EntraUserActionAdapter,
        EdrIsolateActionAdapter,
        AwsIamActionAdapter,
        WafIpActionAdapter,
      ],
    }).compile();

    registry = module.get<ActionExecutionRegistryService>(
      ActionExecutionRegistryService,
    );
    entraAdapter = module.get<EntraUserActionAdapter>(EntraUserActionAdapter);
    edrAdapter = module.get<EdrIsolateActionAdapter>(EdrIsolateActionAdapter);
    awsIamAdapter = module.get<AwsIamActionAdapter>(AwsIamActionAdapter);
    wafIpAdapter = module.get<WafIpActionAdapter>(WafIpActionAdapter);
  });

  it('should be defined', () => {
    expect(registry).toBeDefined();
    expect(entraAdapter).toBeDefined();
    expect(edrAdapter).toBeDefined();
    expect(wafIpAdapter).toBeDefined();
  });

  it('executes Entra ID DISABLE_USER_ACCOUNT simulation and returns signed simulation receipt', async () => {
    const context: ActionExecutionContext = {
      tenantId: 'tenant-123',
      commandId: 'cmd-001',
      actionType: 'DISABLE_USER_ACCOUNT',
      targetRef: 'compromised-user@acme.com',
      authorityLevel: 'R1',
      approvalRef: 'appr-999',
      isSimulation: true,
    };

    const receipt = await registry.executeAction(context);

    expect(receipt.status).toBe('SIMULATED');
    expect(receipt.actionType).toBe('DISABLE_USER_ACCOUNT');
    expect(receipt.targetRef).toBe('compromised-user@acme.com');
    expect(receipt.observedEffect.accountDisabled).toBe(true);
    expect(receipt.signature).toBeDefined();
    expect(receipt.rollbackCapability.supported).toBe(true);

    const rollbackResult = await registry.rollbackAction(receipt);
    expect(rollbackResult.status).toBe('ROLLED_BACK');
  });

  it('rejects live un-simulated execution before G1 gate ratification with ForbiddenException', async () => {
    const context: ActionExecutionContext = {
      tenantId: 'tenant-123',
      commandId: 'cmd-001',
      actionType: 'DISABLE_USER_ACCOUNT',
      targetRef: 'compromised-user@acme.com',
      authorityLevel: 'R2',
      approvalRef: 'appr-999',
      isSimulation: false,
    };

    await expect(registry.executeAction(context)).rejects.toThrow(
      /Live R2\+ automated response execution is strictly disabled: G1 Release Gate has not been formally ratified/,
    );
  });

  it('confirms environment variable overrides (ENABLE_G1_LIVE_EXECUTION / G1_GATE_RATIFIED) CANNOT bypass the G1 gate', async () => {
    const originalEnv = { ...process.env };
    try {
      // Attempt unauthorized bypass via environment variables
      (process.env as any).ENABLE_G1_LIVE_EXECUTION = 'true';
      (process.env as any).G1_GATE_RATIFIED = 'true';

      const containmentActions = [
        { actionType: 'DISABLE_USER_ACCOUNT', targetRef: 'admin@acme.com' },
        { actionType: 'ISOLATE_ENDPOINT', targetRef: 'host-srv-prod' },
        {
          actionType: 'REVOKE_IAM_SESSION',
          targetRef: 'arn:aws:iam::123456789012:role/Admin',
        },
        { actionType: 'APPLY_WAF_BLOCK', targetRef: '203.0.113.55/32' },
      ];

      for (const item of containmentActions) {
        const liveContext: ActionExecutionContext = {
          tenantId: 'tenant-test',
          commandId: `cmd-${item.actionType}`,
          actionType: item.actionType,
          targetRef: item.targetRef,
          authorityLevel: 'R2',
          approvalRef: 'appr-fake',
          isSimulation: false,
        };

        // Assert that even with env vars set to true, execution is strictly rejected
        await expect(registry.executeAction(liveContext)).rejects.toThrow(
          /Live R2\+ automated response execution is strictly disabled: G1 Release Gate has not been formally ratified/,
        );
      }
    } finally {
      delete (process.env as any).ENABLE_G1_LIVE_EXECUTION;
      delete (process.env as any).G1_GATE_RATIFIED;
    }
  });

  it('executes EDR ISOLATE_ENDPOINT simulation and returns simulated receipt', async () => {
    const context: ActionExecutionContext = {
      tenantId: 'tenant-123',
      commandId: 'cmd-002',
      actionType: 'ISOLATE_ENDPOINT',
      targetRef: 'host-win-finance-01',
      authorityLevel: 'R1',
      approvalRef: 'appr-1000',
      isSimulation: true,
    };

    const receipt = await registry.executeAction(context);

    expect(receipt.status).toBe('SIMULATED');
    expect(receipt.actionType).toBe('ISOLATE_ENDPOINT');
    expect(receipt.observedEffect.networkIsolationActive).toBe(true);
    expect(receipt.observedEffect.executionMode).toBe('SIMULATED');
  });

  it('executes AWS IAM REVOKE_IAM_SESSION simulation and returns signed simulation receipt', async () => {
    const context: ActionExecutionContext = {
      tenantId: 'tenant-123',
      commandId: 'cmd-003',
      actionType: 'REVOKE_IAM_SESSION',
      targetRef: 'arn:aws:iam::123456789012:role/CompromisedDevRole',
      authorityLevel: 'R1',
      approvalRef: 'appr-1001',
      isSimulation: true,
    };

    const receipt = await registry.executeAction(context);

    expect(receipt.status).toBe('SIMULATED');
    expect(receipt.actionType).toBe('REVOKE_IAM_SESSION');
    expect(receipt.targetRef).toBe(
      'arn:aws:iam::123456789012:role/CompromisedDevRole',
    );
    expect(receipt.observedEffect.sessionsRevoked).toBe(true);
    expect(receipt.signature).toBeDefined();

    const rollbackResult = await registry.rollbackAction(receipt);
    expect(rollbackResult.status).toBe('ROLLED_BACK');
  });

  it('executes WAF APPLY_WAF_BLOCK simulation with auto-TTL and returns signed simulation receipt', async () => {
    const context: ActionExecutionContext = {
      tenantId: 'tenant-123',
      commandId: 'cmd-004',
      actionType: 'APPLY_WAF_BLOCK',
      targetRef: '198.51.100.42/32',
      authorityLevel: 'R1',
      approvalRef: 'appr-1002',
      parameters: { ttlMinutes: 30 },
      isSimulation: true,
    };

    const receipt = await registry.executeAction(context);

    expect(receipt.status).toBe('SIMULATED');
    expect(receipt.actionType).toBe('APPLY_WAF_BLOCK');
    expect(receipt.targetRef).toBe('198.51.100.42/32');
    expect(receipt.observedEffect.ipBlocked).toBe(true);
    expect(receipt.observedEffect.ttlMinutes).toBe(30);
    expect(receipt.observedEffect.autoExpireAt).toBeDefined();
    expect(receipt.signature).toBeDefined();
    expect(receipt.rollbackCapability.supported).toBe(true);
    expect(receipt.rollbackCapability.rollbackAction).toBe('REMOVE_WAF_BLOCK');

    const rollbackResult = await registry.rollbackAction(receipt);
    expect(rollbackResult.status).toBe('ROLLED_BACK');
  });

  it('throws NotFoundException for unregistered action type', () => {
    expect(() => registry.getAdapter('UNREGISTERED_DANGEROUS_ACTION')).toThrow(
      /No certified action execution adapter registered/,
    );
  });
});
