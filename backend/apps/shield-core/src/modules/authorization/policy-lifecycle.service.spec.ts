import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PolicyLifecycleService } from './policy-lifecycle.service';

describe('PolicyLifecycleService', () => {
  let service: PolicyLifecycleService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PolicyLifecycleService],
    }).compile();

    service = module.get<PolicyLifecycleService>(PolicyLifecycleService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listPolicies', () => {
    it('returns canonical seed policies for global or specific tenant', () => {
      const policies = service.listPolicies('tenant-alpha');
      expect(policies.length).toBeGreaterThanOrEqual(4);
      expect(policies[0]).toHaveProperty('id');
      expect(policies[0]).toHaveProperty('policyName');
      expect(policies[0]).toHaveProperty('domain');
      expect(policies[0]).toHaveProperty('status');
    });

    it('filters policies by domain when specified', () => {
      const iamPolicies = service.listPolicies('tenant-alpha', 'IAM');
      expect(iamPolicies.every((p) => p.domain === 'IAM')).toBe(true);
      expect(iamPolicies.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getPolicyById', () => {
    it('returns policy when found', () => {
      const policy = service.getPolicyById('tenant-alpha', 'pol-2026-09-001');
      expect(policy.id).toBe('pol-2026-09-001');
      expect(policy.policyName).toBe('Zero-Trust JIT Admin Escalation Policy');
      expect(policy.diffContent).toBeDefined();
    });

    it('throws NotFoundException for non-existent policy', () => {
      expect(() =>
        service.getPolicyById('tenant-alpha', 'pol-non-existent-999'),
      ).toThrow(NotFoundException);
    });
  });

  describe('stagePolicy', () => {
    it('stages a policy to an environment with canary percentage', () => {
      const staged = service.stagePolicy(
        'tenant-alpha',
        'pol-2026-09-001',
        {
          stagedEnvironment: 'staging-us-east1',
          canaryPercentage: 25,
        },
        'secops-operator@tenant.com',
      );

      expect(staged.stagedEnvironment).toBe('staging-us-east1');
      expect(staged.canaryPercentage).toBe(25);
      expect(staged.status).toBe('STAGED');
    });

    it('marks policy as ACTIVE when canary percentage is 100%', () => {
      const staged = service.stagePolicy(
        'tenant-alpha',
        'pol-2026-09-001',
        {
          stagedEnvironment: 'production-global',
          canaryPercentage: 100,
        },
        'secops-operator@tenant.com',
      );

      expect(staged.canaryPercentage).toBe(100);
      expect(staged.status).toBe('ACTIVE');
    });
  });

  describe('approvePolicy (4-Eyes dual-custody)', () => {
    it('records peer approval and promotes to ACTIVE when dual custody is met', () => {
      // pol-2026-09-001 already has 1 approver: soc-lead@zoikoshield.corp
      const approved = service.approvePolicy(
        'tenant-alpha',
        'pol-2026-09-001',
        'ciso@zoikoshield.corp',
      );

      expect(approved.approvers).toContain('ciso@zoikoshield.corp');
      expect(approved.approvers.length).toBe(2);
      expect(approved.status).toBe('ACTIVE');
    });

    it('rejects duplicate approval from the same approver', () => {
      expect(() =>
        service.approvePolicy(
          'tenant-alpha',
          'pol-2026-09-001',
          'soc-lead@zoikoshield.corp',
        ),
      ).toThrow(BadRequestException);
    });
  });

  describe('rollbackPolicy', () => {
    it('rolls back a policy and records the reason with 0% canary', () => {
      const rolledBack = service.rollbackPolicy(
        'tenant-alpha',
        'pol-2026-09-002',
        {
          reason: 'Canary anomaly detected: JIT session latency elevated by 25ms.',
        },
        'sre-lead@tenant.com',
      );

      expect(rolledBack.status).toBe('ROLLED_BACK');
      expect(rolledBack.canaryPercentage).toBe(0);
      expect(rolledBack.reversalReason).toBe(
        'Canary anomaly detected: JIT session latency elevated by 25ms.',
      );
    });
  });
});
