import { Test, TestingModule } from '@nestjs/testing';
import {
  PlaybookSandboxEngineService,
  DryRunPlaybookRequest,
} from './playbook-sandbox-engine.service';

describe('PlaybookSandboxEngineService', () => {
  let service: PlaybookSandboxEngineService;
  const tenantId = 'tenant-sandbox-test-102';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PlaybookSandboxEngineService],
    }).compile();

    service = module.get<PlaybookSandboxEngineService>(
      PlaybookSandboxEngineService,
    );
  });

  it('should calculate simulated state diffs and blast radius for standard assets', async () => {
    const request: DryRunPlaybookRequest = {
      tenantId,
      playbookId: 'PB-CONTAIN-COMPROMISED-IAM',
      incidentId: 'INC-2026-SANDBOX-01',
      targetAssets: [
        {
          assetId: 'arn:aws:iam::123456789012:role/DevWorkerRole',
          assetType: 'AWS_IAM_ROLE',
          criticalityTier: 'TIER_1_STANDARD',
          currentState: { attachedPolicies: ['AdministratorAccess'] },
        },
      ],
      actions: [
        {
          actionId: 'act-revoke-01',
          type: 'REVOKE_IAM_SESSION',
          parameters: {},
        },
      ],
    };

    const report = await service.simulatePlaybook(request);
    expect(report.status).toBe('DRY_RUN_PASSED');
    expect(report.policyVerdict).toBe('ALLOWED');
    expect(report.stateDiffs.length).toBe(1);
    expect(report.stateDiffs[0].before).toEqual(['AdministratorAccess']);
    expect(report.stateDiffs[0].after).toEqual([
      'AWSQuarantinePolicy-ReadOnly',
    ]);
    expect(report.safetyViolations.length).toBe(0);
  });

  it('should flag safety violations when isolating Tier-0 critical assets without break-glass', async () => {
    const request: DryRunPlaybookRequest = {
      tenantId,
      playbookId: 'PB-EMERGENCY-HOST-ISOLATION',
      incidentId: 'INC-2026-SANDBOX-02',
      targetAssets: [
        {
          assetId: 'cluster-prod-core-db-primary',
          assetType: 'DATABASE_CLUSTER',
          criticalityTier: 'TIER_0_CRITICAL',
          currentState: { networkIsolationState: 'CONNECTED' },
        },
      ],
      actions: [
        {
          actionId: 'act-isolate-01',
          type: 'ISOLATE_EDR_HOST',
          parameters: {},
        },
      ],
    };

    const report = await service.simulatePlaybook(request);
    expect(report.status).toBe('DRY_RUN_BLOCKED');
    expect(report.policyVerdict).toBe('DENIED');
    expect(report.safetyViolations.length).toBe(1);
    expect(report.safetyViolations[0]).toContain('TIER_0_CRITICAL');
  });
});
