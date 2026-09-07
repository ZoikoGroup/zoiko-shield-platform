import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { DynamicTokenizationProxyService } from './dynamic-tokenization-proxy.service';
import { DifferentialPrivacyGuardService } from '../../../../shield-ai/src/privacy/differential-privacy-guard.service';

describe('DynamicTokenizationProxyService & DifferentialPrivacyGuardService (LAB 22 Privacy & Tokenization)', () => {
  let tokenProxy: DynamicTokenizationProxyService;
  let diffPrivacyGuard: DifferentialPrivacyGuardService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DynamicTokenizationProxyService, DifferentialPrivacyGuardService],
    }).compile();

    tokenProxy = module.get<DynamicTokenizationProxyService>(DynamicTokenizationProxyService);
    diffPrivacyGuard = module.get<DifferentialPrivacyGuardService>(DifferentialPrivacyGuardService);
  });

  describe('PII Anonymization & Format-Preserving Encryption (FPE)', () => {
    it('should mask sensitive telemetry fields on-the-fly (email, PAN, IP)', () => {
      const rawTelemetry = {
        userEmail: 'alice.smith@enterprise.com',
        creditCard: '4111-2222-3333-4444',
        clientIp: '198.51.100.44',
        action: 'USER_LOGIN',
      };

      const masked = tokenProxy.anonymizeObject('tenant-fintech-01', rawTelemetry, 'FULL_MASK');

      expect(masked.userEmail).toBe('a***h@enterprise.com');
      expect(masked.creditCard).toBe('4111-XXXX-XXXX-4444');
      expect(masked.clientIp).toBe('198.51.XXX.XXX');
      expect(masked.action).toBe('USER_LOGIN');
    });

    it('should generate reversible surrogate tokens and unmask under JIT authorization', () => {
      const tenantId = 'tenant-healthcare-01';
      const originalSsn = '123-45-6789';

      const token = tokenProxy.generateReversibleToken(tenantId, originalSsn, 'SSN');
      expect(token).toMatch(/^fpe_ssn_[0-9a-f]{16}$/);

      // Unmask with valid JIT context
      const unmasked = tokenProxy.unmaskValue(tenantId, token, {
        operatorId: 'operator-lead-dr',
        jitRequestId: 'jit-req-compliance-audit-2026',
        reason: 'HIPAA authorized compliance inspection',
      });

      expect(unmasked).toBe(originalSsn);

      const auditTrail = tokenProxy.getAuditTrail();
      expect(auditTrail).toHaveLength(1);
      expect(auditTrail[0].token).toBe(token);
      expect(auditTrail[0].jitRequestId).toBe('jit-req-compliance-audit-2026');
    });

    it('should REJECT unmasking when JIT authorization context is missing', () => {
      const tenantId = 'tenant-healthcare-01';
      const token = tokenProxy.generateReversibleToken(tenantId, 'sensitive-secret', 'RAW');

      expect(() =>
        tokenProxy.unmaskValue(tenantId, token, {
          operatorId: '',
          jitRequestId: '',
          reason: 'unauthorized attempt',
        }),
      ).toThrow(UnauthorizedException);
    });
  });

  describe('Differential Privacy & Laplace Mechanism Guard', () => {
    it('should perturb numerical telemetry metrics and deduct epsilon budget', () => {
      const tenantId = 'tenant-ai-research';

      const result = diffPrivacyGuard.perturbMetric({
        tenantId,
        metricName: 'failed_auth_count',
        trueValue: 50,
        sensitivity: 1.0,
        epsilonCost: 0.5,
      });

      expect(result.perturbedValue).toBeDefined();
      expect(result.mechanism).toBe('LAPLACE_MECHANISM');
      expect(result.remainingEpsilonBudget).toBe(9.5);
      expect(result.privacyProofDigest).toHaveLength(64);
    });

    it('should REJECT queries and throw ForbiddenException when tenant epsilon budget is exhausted', () => {
      const tenantId = 'tenant-exhausted-privacy';

      // Exhaust 10.0 epsilon budget with 20 queries of 0.5 cost
      for (let i = 0; i < 20; i++) {
        diffPrivacyGuard.perturbMetric({
          tenantId,
          metricName: 'query_metric',
          trueValue: 100,
          sensitivity: 1.0,
          epsilonCost: 0.5,
        });
      }

      // Next query should be blocked
      expect(() =>
        diffPrivacyGuard.perturbMetric({
          tenantId,
          metricName: 'query_metric',
          trueValue: 100,
          sensitivity: 1.0,
          epsilonCost: 0.5,
        }),
      ).toThrow(ForbiddenException);
    });
  });
});
