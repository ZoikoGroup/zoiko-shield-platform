import { Test, TestingModule } from '@nestjs/testing';
import {
  BlastRadiusEvaluatorService,
  TargetCriticalityTier,
} from './blast-radius-evaluator.service';

describe('BlastRadiusEvaluatorService (ZS-ENG-DRS-001 §19)', () => {
  let service: BlastRadiusEvaluatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BlastRadiusEvaluatorService],
    }).compile();

    service = module.get<BlastRadiusEvaluatorService>(BlastRadiusEvaluatorService);
  });

  describe('1. Target Criticality Classification', () => {
    it('classifies Active Directory Domain Controller as TIER_0_CRITICAL', () => {
      const res = service.classifyTarget('ad-root-domain-controller-01.corp');
      expect(res.tier).toBe('TIER_0_CRITICAL');
    });

    it('classifies AWS Root Account Role as TIER_0_CRITICAL', () => {
      const res = service.classifyTarget('arn:aws:iam::123456789012:root');
      expect(res.tier).toBe('TIER_0_CRITICAL');
    });

    it('classifies Production Kubernetes Cluster as TIER_1_PRODUCTION', () => {
      const res = service.classifyTarget('prod-eks-cluster-core-nodes');
      expect(res.tier).toBe('TIER_1_PRODUCTION');
    });

    it('classifies standard developer endpoint as TIER_2_STANDARD', () => {
      const res = service.classifyTarget('workstation-dev-laptop-42');
      expect(res.tier).toBe('TIER_2_STANDARD');
    });
  });

  describe('2. Invariant Enforcement & Blast Radius Limits', () => {
    it('STRICTLY BLOCKS automated action on Tier-0 target without Dual-Custody Approval', () => {
      const result = service.evaluateBlastRadius({
        tenantId: 'tenant-acme',
        actionType: 'ISOLATE_HOST',
        targetResource: 'db-master-primary-cluster',
        requestorId: 'soc-analyst-1',
        isDualCustodyApproved: false,
      });

      expect(result.allowed).toBe(false);
      expect(result.tier).toBe('TIER_0_CRITICAL');
      expect(result.requiresDualStepup).toBe(true);
      expect(result.reason).toContain('BLAST_RADIUS_VIOLATION');
      expect(result.cryptographicAssessmentDigest).toBeDefined();
      expect(result.cryptographicAssessmentDigest).toHaveLength(64);
    });

    it('ALLOWS action on Tier-0 target when Dual-Custody Approval IS provided', () => {
      const result = service.evaluateBlastRadius({
        tenantId: 'tenant-acme',
        actionType: 'REVOKE_SESSION',
        targetResource: 'idp-root-auth0',
        requestorId: 'soc-analyst-1',
        isDualCustodyApproved: true,
      });

      expect(result.allowed).toBe(true);
      expect(result.tier).toBe('TIER_0_CRITICAL');
      expect(result.reason).toContain('TIER_0_STEPPED_UP');
    });

    it('BLOCKS Tier-1 production action if concurrent action ceiling (2) is exceeded', () => {
      const result = service.evaluateBlastRadius({
        tenantId: 'tenant-acme',
        actionType: 'QUARANTINE_POD',
        targetResource: 'prod-api-gateway-pod-1',
        activeConcurrentActionsCount: 2,
        requestorId: 'soc-analyst-1',
        isDualCustodyApproved: false,
      });

      expect(result.allowed).toBe(false);
      expect(result.tier).toBe('TIER_1_PRODUCTION');
      expect(result.reason).toContain('BLAST_RADIUS_CONCURRENCY_EXCEEDED');
    });

    it('ALLOWS Tier-1 production action when under concurrency ceiling', () => {
      const result = service.evaluateBlastRadius({
        tenantId: 'tenant-acme',
        actionType: 'QUARANTINE_POD',
        targetResource: 'prod-api-gateway-pod-1',
        activeConcurrentActionsCount: 1,
        totalFleetAssetsCount: 50,
        requestorId: 'soc-analyst-1',
        isDualCustodyApproved: false,
      });

      expect(result.allowed).toBe(true);
      expect(result.tier).toBe('TIER_1_PRODUCTION');
      expect(result.reason).toContain('TIER_1_APPROVED');
    });

    it('ALLOWS Tier-2 standard workstation action without restriction up to normal rate limits', () => {
      const result = service.evaluateBlastRadius({
        tenantId: 'tenant-acme',
        actionType: 'ISOLATE_HOST',
        targetResource: 'laptop-user-99',
        activeConcurrentActionsCount: 3,
        requestorId: 'soc-analyst-1',
      });

      expect(result.allowed).toBe(true);
      expect(result.tier).toBe('TIER_2_STANDARD');
    });
  });

  describe('3. Custom Tenant Rule Overrides', () => {
    it('honors custom tenant criticality rules', () => {
      service.registerTenantRule('tenant-custom', {
        targetPattern: '.*secret-rnd-project.*',
        tier: 'TIER_0_CRITICAL',
        description: 'Tenant Custom Secret R&D Infrastructure',
      });

      const res = service.classifyTarget('server-secret-rnd-project-01', 'tenant-custom');
      expect(res.tier).toBe('TIER_0_CRITICAL');
      expect(res.matchedRule).toBe('Tenant Custom Secret R&D Infrastructure');
    });
  });
});
