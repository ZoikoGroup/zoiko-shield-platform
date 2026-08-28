import { DifferentialPrivacyGuardService } from './differential-privacy-guard.service';
import { ForbiddenException } from '@nestjs/common';

describe('DifferentialPrivacyGuardService', () => {
  let dpGuard: DifferentialPrivacyGuardService;

  beforeEach(() => {
    dpGuard = new DifferentialPrivacyGuardService();
  });

  it('should perturb numerical aggregations using Laplace mechanism and decrement budget', () => {
    const res = dpGuard.perturbMetric({
      tenantId: 'tenant-enterprise-ai-01',
      metricName: 'failed_logins_last_hour',
      trueValue: 42,
      sensitivity: 1.0,
      epsilonCost: 0.5,
    });

    expect(res.trueValue).toBe(42);
    expect(res.perturbedValue).toBeDefined();
    expect(typeof res.perturbedValue).toBe('number');
    expect(res.mechanism).toBe('LAPLACE_MECHANISM');
    expect(res.remainingEpsilonBudget).toBe(9.5);
    expect(res.privacyProofDigest).toBeDefined();
  });

  it('should throw ForbiddenException when epsilon privacy budget is exhausted', () => {
    const tenantId = 'tenant-budget-test';

    // Consume entire budget (10.0) with large epsilon costs
    dpGuard.perturbMetric({
      tenantId,
      metricName: 'metric_a',
      trueValue: 100,
      sensitivity: 1.0,
      epsilonCost: 5.0,
    });

    dpGuard.perturbMetric({
      tenantId,
      metricName: 'metric_b',
      trueValue: 100,
      sensitivity: 1.0,
      epsilonCost: 5.0,
    });

    // Next query must be rejected
    expect(() => {
      dpGuard.perturbMetric({
        tenantId,
        metricName: 'metric_c',
        trueValue: 100,
        sensitivity: 1.0,
        epsilonCost: 0.5,
      });
    }).toThrow(ForbiddenException);
  });
});
