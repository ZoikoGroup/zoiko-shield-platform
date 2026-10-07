import { Test, TestingModule } from '@nestjs/testing';
import {
  WasmPlaybookSandboxService,
  WasmSandboxExecutionReport,
} from './wasm-playbook-sandbox.service';
import {
  SimulateWasmPlaybookDto,
  SynthesizeRollbackDto,
  WasmSandboxMutationType,
  PlaybookExecutionTier,
} from './dto/wasm-playbook.dto';

describe('WasmPlaybookSandboxService (LAB 18 & Spec §18 WASM Sandbox & Rollback Synthesis)', () => {
  let service: WasmPlaybookSandboxService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WasmPlaybookSandboxService],
    }).compile();

    service = module.get<WasmPlaybookSandboxService>(
      WasmPlaybookSandboxService,
    );
  });

  it('should successfully simulate a valid custom WASM playbook with acceptable blast radius', async () => {
    const validDto: SimulateWasmPlaybookDto = {
      tenantId: 'tenant-enterprise-01',
      playbookId: 'PB-WASM-CONTAIN-CRED-01',
      playbookVersion: '1.0.0',
      incidentId: 'INC-2026-9921',
      wasmBytecodeBase64: Buffer.from(
        '\x00asm\x01\x00\x00\x00custom-soar-bytes',
      ).toString('base64'),
      steps: [
        {
          stepId: 'step-1',
          actionType: WasmSandboxMutationType.AWS_IAM_ATTACH_POLICY,
          targetResourceArn:
            'arn:aws:iam::123456789012:role/CompromisedDevRole',
          parameters: { policyArn: 'AWSQuarantinePolicy-ReadOnly' },
        },
        {
          stepId: 'step-2',
          actionType: WasmSandboxMutationType.OKTA_REVOKE_USER_SESSIONS,
          targetResourceArn: 'okta:user:usr_9941a',
        },
      ],
      targetAssets: [
        {
          assetId: 'arn:aws:iam::123456789012:role/CompromisedDevRole',
          criticalityTier: PlaybookExecutionTier.TIER_2_DEV,
          cloudProvider: 'AWS',
          preExecutionState: { attachedPolicies: ['DevFullAccess'] },
        },
        {
          assetId: 'okta:user:usr_9941a',
          criticalityTier: PlaybookExecutionTier.TIER_2_DEV,
          cloudProvider: 'OKTA',
          preExecutionState: { sessionCount: 2 },
        },
      ],
    };

    const report: WasmSandboxExecutionReport =
      await service.simulateWasmPlaybook(validDto);

    expect(report.status).toBe('SANDBOX_PASSED');
    expect(report.bytecodeHashSha256).toBeDefined();
    expect(report.simulatedBlastRadiusScore).toBeLessThanOrEqual(0.5);
    expect(report.safetyViolations.length).toBe(0);
    expect(report.rollbackGuaranteeAvailable).toBe(true);
    expect(report.stateDiffs.length).toBe(4);
    expect(report.synthesizedRollbackPlan).toBeDefined();
    expect(report.synthesizedRollbackPlan?.length).toBe(2);
  });

  it('should reject and flag policy violation when WASM playbook targets TIER_0_CRITICAL asset with automated drain', async () => {
    const unsafeDto: SimulateWasmPlaybookDto = {
      tenantId: 'tenant-defense-02',
      playbookId: 'PB-WASM-DRAIN-PROD-UNSAFE',
      playbookVersion: '2.1.0',
      incidentId: 'INC-2026-CRITICAL',
      wasmBytecodeBase64: Buffer.from(
        '\x00asm\x01\x00\x00\x00drain-cluster',
      ).toString('base64'),
      steps: [
        {
          stepId: 'step-drain-1',
          actionType: WasmSandboxMutationType.K8S_DRAIN_NODE,
          targetResourceArn: 'k8s:cluster:prod-core-node-01',
        },
      ],
      targetAssets: [
        {
          assetId: 'k8s:cluster:prod-core-node-01',
          criticalityTier: PlaybookExecutionTier.TIER_0_CRITICAL,
          cloudProvider: 'KUBERNETES',
          preExecutionState: { status: 'READY', activePods: 48 },
        },
      ],
    };

    const report: WasmSandboxExecutionReport =
      await service.simulateWasmPlaybook(unsafeDto);

    expect(report.status).toBe('SANDBOX_REJECTED_POLICY');
    expect(report.safetyViolations.length).toBeGreaterThan(0);
    expect(report.safetyViolations[0]).toContain('TIER_0_CRITICAL');
  });

  it('should reject when cumulative blast radius exceeds the 0.5 safety threshold', async () => {
    const highBlastRadiusDto: SimulateWasmPlaybookDto = {
      tenantId: 'tenant-finance-03',
      playbookId: 'PB-WASM-HIGH-BLAST',
      playbookVersion: '1.0.0',
      incidentId: 'INC-2026-MASS-ISOLATE',
      wasmBytecodeBase64: Buffer.from(
        '\x00asm\x01\x00\x00\x00mass-isolation',
      ).toString('base64'),
      steps: [
        {
          stepId: 'step-1',
          actionType: WasmSandboxMutationType.AWS_EC2_ISOLATE_SECURITY_GROUP,
          targetResourceArn: 'aws:ec2:sg-mass-01',
        },
      ],
      targetAssets: [
        {
          assetId: 'aws:ec2:sg-mass-01',
          criticalityTier: PlaybookExecutionTier.TIER_1_STANDARD,
          cloudProvider: 'AWS',
          preExecutionState: { rules: 'ALLOW_ALL' },
        },
        {
          assetId: 'aws:ec2:sg-mass-02',
          criticalityTier: PlaybookExecutionTier.TIER_1_STANDARD,
          cloudProvider: 'AWS',
          preExecutionState: { rules: 'ALLOW_ALL' },
        },
        {
          assetId: 'aws:ec2:sg-mass-03',
          criticalityTier: PlaybookExecutionTier.TIER_1_STANDARD,
          cloudProvider: 'AWS',
          preExecutionState: { rules: 'ALLOW_ALL' },
        },
        {
          assetId: 'aws:ec2:sg-mass-04',
          criticalityTier: PlaybookExecutionTier.TIER_1_STANDARD,
          cloudProvider: 'AWS',
          preExecutionState: { rules: 'ALLOW_ALL' },
        },
      ],
    };

    const report: WasmSandboxExecutionReport =
      await service.simulateWasmPlaybook(highBlastRadiusDto);

    expect(report.simulatedBlastRadiusScore).toBeGreaterThan(0.5);
    expect(report.status).toBe('SANDBOX_REJECTED_BLAST_RADIUS');
  });

  it('should synthesize a deterministic, reversed inverse rollback plan', () => {
    const rollbackDto: SynthesizeRollbackDto = {
      tenantId: 'tenant-fintech-04',
      playbookId: 'PB-WASM-EXEC-09',
      executedSteps: [
        {
          stepId: 'step-1',
          actionType: WasmSandboxMutationType.AWS_IAM_ATTACH_POLICY,
          targetResourceArn: 'arn:aws:iam::111:role/Dev',
        },
        {
          stepId: 'step-2',
          actionType: WasmSandboxMutationType.CROWDSTRIKE_CONTAIN_HOST,
          targetResourceArn: 'host-win-01',
        },
      ],
      originalAssetStates: [
        {
          assetId: 'arn:aws:iam::111:role/Dev',
          criticalityTier: PlaybookExecutionTier.TIER_2_DEV,
          cloudProvider: 'AWS',
          preExecutionState: { attachedPolicies: ['RolePolicyOriginal'] },
        },
        {
          assetId: 'host-win-01',
          criticalityTier: PlaybookExecutionTier.TIER_2_DEV,
          cloudProvider: 'OKTA',
          preExecutionState: { edrContainmentStatus: 'UNCONTAINED' },
        },
      ],
    };

    const result = service.synthesizeRollbackPlan(rollbackDto);

    expect(result.planId).toBeDefined();
    expect(result.totalRollbackSteps).toBe(2);
    // Step 2 (last executed) must be reversed first
    expect(result.rollbackSteps[0].stepId).toBe('rb-step-step-2');
    expect(result.rollbackSteps[0].inverseActionType).toBe(
      'CROWDSTRIKE_LIFT_HOST_CONTAINMENT',
    );
    // Step 1 reversed second
    expect(result.rollbackSteps[1].stepId).toBe('rb-step-step-1');
    expect(result.rollbackSteps[1].inverseActionType).toBe(
      WasmSandboxMutationType.AWS_IAM_DETACH_POLICY,
    );
    expect(result.deterministicIntegrityDigest).toBeDefined();
  });
});
