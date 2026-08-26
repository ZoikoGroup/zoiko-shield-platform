import { Test, TestingModule } from '@nestjs/testing';
import { ActionExecutionRegistryService } from './action-execution-registry.service';
import { EntraUserActionAdapter } from './entra-user.adapter';
import { EdrIsolateActionAdapter } from './edr-isolate.adapter';
import { AwsIamActionAdapter } from './aws-iam.adapter';
import { ActionExecutionContext } from './action-execution.interface';

describe('ActionExecutionRegistry & Adapters', () => {
  let registry: ActionExecutionRegistryService;
  let entraAdapter: EntraUserActionAdapter;
  let edrAdapter: EdrIsolateActionAdapter;
  let awsIamAdapter: AwsIamActionAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActionExecutionRegistryService,
        EntraUserActionAdapter,
        EdrIsolateActionAdapter,
        AwsIamActionAdapter,
      ],
    }).compile();

    registry = module.get<ActionExecutionRegistryService>(
      ActionExecutionRegistryService,
    );
    entraAdapter = module.get<EntraUserActionAdapter>(EntraUserActionAdapter);
    edrAdapter = module.get<EdrIsolateActionAdapter>(EdrIsolateActionAdapter);
    awsIamAdapter = module.get<AwsIamActionAdapter>(AwsIamActionAdapter);
  });

  it('should be defined', () => {
    expect(registry).toBeDefined();
    expect(entraAdapter).toBeDefined();
    expect(edrAdapter).toBeDefined();
  });

  it('executes Entra ID DISABLE_USER_ACCOUNT action and returns signed receipt', async () => {
    const context: ActionExecutionContext = {
      tenantId: 'tenant-123',
      commandId: 'cmd-001',
      actionType: 'DISABLE_USER_ACCOUNT',
      targetRef: 'compromised-user@acme.com',
      authorityLevel: 'R2',
      approvalRef: 'appr-999',
      isSimulation: false,
    };

    const receipt = await registry.executeAction(context);

    expect(receipt.status).toBe('EXECUTED');
    expect(receipt.actionType).toBe('DISABLE_USER_ACCOUNT');
    expect(receipt.targetRef).toBe('compromised-user@acme.com');
    expect(receipt.observedEffect.accountDisabled).toBe(true);
    expect(receipt.signature).toBeDefined();
    expect(receipt.rollbackCapability.supported).toBe(true);

    const rollbackResult = await registry.rollbackAction(receipt);
    expect(rollbackResult.status).toBe('ROLLED_BACK');
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

  it('executes AWS IAM REVOKE_IAM_SESSION action and returns signed receipt', async () => {
    const context: ActionExecutionContext = {
      tenantId: 'tenant-123',
      commandId: 'cmd-003',
      actionType: 'REVOKE_IAM_SESSION',
      targetRef: 'arn:aws:iam::123456789012:role/CompromisedDevRole',
      authorityLevel: 'R2',
      approvalRef: 'appr-1001',
      isSimulation: false,
    };

    const receipt = await registry.executeAction(context);

    expect(receipt.status).toBe('EXECUTED');
    expect(receipt.actionType).toBe('REVOKE_IAM_SESSION');
    expect(receipt.targetRef).toBe('arn:aws:iam::123456789012:role/CompromisedDevRole');
    expect(receipt.observedEffect.sessionsRevoked).toBe(true);
    expect(receipt.signature).toBeDefined();

    const rollbackResult = await registry.rollbackAction(receipt);
    expect(rollbackResult.status).toBe('ROLLED_BACK');
  });

  it('throws NotFoundException for unregistered action type', () => {
    expect(() => registry.getAdapter('UNREGISTERED_DANGEROUS_ACTION')).toThrow(
      /No certified action execution adapter registered/,
    );
  });
});
