import { Test, TestingModule } from '@nestjs/testing';
import { ShieldActionController } from '../shield-action.controller';
import { WasmPlaybookSandboxService } from './wasm-playbook-sandbox.service';
import { SimulationService } from './simulation.service';
import { ActionRollbackBrokerService } from '../rollback/action-rollback-broker.service';
import { FreezeControllerService } from '../freeze-controller/freeze-controller.service';
import { EmergencyFreezeLockdownService } from '../freeze-controller/emergency-freeze-lockdown.service';
import { BlastRadiusEvaluatorService } from '../rate-control/blast-radius-evaluator.service';
import { CompensatingActionService } from '../rollback/compensating-action.service';
import { TwoManRuleService } from '../approval/two-man-rule.service';
import { DistributedActionLockService } from '../orchestration/distributed-action-lock.service';
import {
  SimulateWasmPlaybookDto,
  SynthesizeRollbackDto,
  WasmSandboxMutationType,
  PlaybookExecutionTier,
} from './dto/wasm-playbook.dto';

describe('ShieldActionController - WASM Playbook Sandbox Endpoints', () => {
  let controller: ShieldActionController;
  let wasmSandboxService: WasmPlaybookSandboxService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ShieldActionController],
      providers: [
        WasmPlaybookSandboxService,
        { provide: SimulationService, useValue: {} },
        { provide: ActionRollbackBrokerService, useValue: {} },
        { provide: FreezeControllerService, useValue: {} },
        { provide: EmergencyFreezeLockdownService, useValue: {} },
        { provide: BlastRadiusEvaluatorService, useValue: {} },
        { provide: CompensatingActionService, useValue: {} },
        { provide: TwoManRuleService, useValue: {} },
        { provide: DistributedActionLockService, useValue: {} },
      ],
    }).compile();

    controller = module.get<ShieldActionController>(ShieldActionController);
    wasmSandboxService = module.get<WasmPlaybookSandboxService>(
      WasmPlaybookSandboxService,
    );
  });

  it('should call simulateWasmPlaybook and return execution report', async () => {
    const dto: SimulateWasmPlaybookDto = {
      tenantId: 'tenant-test-01',
      playbookId: 'PB-WASM-01',
      playbookVersion: '1.0.0',
      incidentId: 'INC-100',
      wasmBytecodeBase64: Buffer.from('\x00asm\x01\x00\x00\x00test').toString(
        'base64',
      ),
      steps: [
        {
          stepId: 's1',
          actionType: WasmSandboxMutationType.AWS_IAM_ATTACH_POLICY,
          targetResourceArn: 'arn:aws:iam::111:role/Test',
        },
      ],
      targetAssets: [
        {
          assetId: 'arn:aws:iam::111:role/Test',
          criticalityTier: PlaybookExecutionTier.TIER_2_DEV,
          cloudProvider: 'AWS',
          preExecutionState: { attachedPolicies: ['Admin'] },
        },
      ],
    };

    const response = await controller.simulateWasmPlaybook(dto);
    expect(response).toBeDefined();
    expect((response as any).status).toBe('SANDBOX_PASSED');
  });

  it('should call synthesizeWasmRollback and return synthesized plan', async () => {
    const dto: SynthesizeRollbackDto = {
      tenantId: 'tenant-test-01',
      playbookId: 'PB-WASM-01',
      executedSteps: [
        {
          stepId: 's1',
          actionType: WasmSandboxMutationType.AWS_IAM_ATTACH_POLICY,
          targetResourceArn: 'arn:aws:iam::111:role/Test',
        },
      ],
      originalAssetStates: [
        {
          assetId: 'arn:aws:iam::111:role/Test',
          criticalityTier: PlaybookExecutionTier.TIER_2_DEV,
          cloudProvider: 'AWS',
          preExecutionState: { attachedPolicies: ['Admin'] },
        },
      ],
    };

    const response = await controller.synthesizeWasmRollback(dto);
    expect(response).toBeDefined();
    expect((response as any).totalRollbackSteps).toBe(1);
    expect((response as any).rollbackSteps[0].stepId).toBe('rb-step-s1');
  });
});
