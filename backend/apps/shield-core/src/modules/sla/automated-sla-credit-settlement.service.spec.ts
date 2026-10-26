import { AutomatedSlaCreditSettlementService } from './automated-sla-credit-settlement.service';

describe('AutomatedSlaCreditSettlementService (Master Commercial Estate v2.0 §11 & P0-20)', () => {
  let settlementService: AutomatedSlaCreditSettlementService;

  beforeEach(() => {
    settlementService = new AutomatedSlaCreditSettlementService();
  });

  it('should issue NO_CREDIT_DUE when availability and MTTR exceed commitments', () => {
    const res = settlementService.evaluateAndSettleSlaCredits({
      tenantId: 'tenant-acme',
      billingPeriodMonth: '2026-08',
      measuredUptimePercent: 99.995, // Above 99.99% target
      p1IncidentCount: 1,
      averageP1MttrMinutes: 8, // Below 15m target
      monthlyContractValueUsd: 20000,
    });

    expect(res.isBreached).toBe(false);
    expect(res.creditPercentage).toBe(0);
    expect(res.creditAmountUsd).toBe(0);
    expect(res.invoiceAdjustmentStatus).toBe('NO_CREDIT_DUE');
    expect(res.requiresPolicyAuthorityApproval).toBe(false);
    expect(res.autoNettingForbidden).toBe(true);
  });

  it('should log CANDIDATE_CREDIT_EVENT_LOGGED without auto-netting when availability drops below 99.99%', () => {
    const res = settlementService.evaluateAndSettleSlaCredits({
      tenantId: 'tenant-acme',
      billingPeriodMonth: '2026-08',
      measuredUptimePercent: 99.85, // 10% credit tier
      p1IncidentCount: 0,
      averageP1MttrMinutes: 0,
      monthlyContractValueUsd: 50000,
      sensorTimestamp: new Date().toISOString(),
      isSensorStale: false,
    });

    expect(res.isBreached).toBe(true);
    expect(res.creditPercentage).toBe(10);
    expect(res.creditAmountUsd).toBe(5000); // 10% of $50,000
    // Invariant §11 & P0-20: Credits are candidates, never auto-applied to open invoices
    expect(res.invoiceAdjustmentStatus).toBe('CANDIDATE_CREDIT_EVENT_LOGGED');
    expect(res.requiresPolicyAuthorityApproval).toBe(true);
    expect(res.autoNettingForbidden).toBe(true);
    expect(res.breachReasons[0]).toContain('Availability Target Missed');
  });

  it('should calculate MTTR breach candidate credit when P1 response time exceeds 60m', () => {
    const res = settlementService.evaluateAndSettleSlaCredits({
      tenantId: 'tenant-acme',
      billingPeriodMonth: '2026-08',
      measuredUptimePercent: 99.999,
      p1IncidentCount: 2,
      averageP1MttrMinutes: 75, // Severe breach (> 60m)
      monthlyContractValueUsd: 100000,
      sensorTimestamp: new Date().toISOString(),
    });

    expect(res.isBreached).toBe(true);
    expect(res.creditPercentage).toBe(30);
    expect(res.creditAmountUsd).toBe(30000); // 30% of $100,000
    expect(res.invoiceAdjustmentStatus).toBe('CANDIDATE_CREDIT_EVENT_LOGGED');
  });

  it('P0-20: stale SLA sensor cannot issue automatic credits and must be held for review', () => {
    // Sensor timestamp 48 hours old (> 24h threshold)
    const staleTimestamp = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const res = settlementService.evaluateAndSettleSlaCredits({
      tenantId: 'tenant-acme',
      billingPeriodMonth: '2026-08',
      measuredUptimePercent: 94.0, // Would be 50% breach if fresh
      p1IncidentCount: 1,
      averageP1MttrMinutes: 80,
      monthlyContractValueUsd: 100000,
      sensorTimestamp: staleTimestamp,
      isSensorStale: true,
    });

    expect(res.isBreached).toBe(true);
    expect(res.invoiceAdjustmentStatus).toBe('STALE_SENSOR_HELD_FOR_REVIEW');
    expect(res.breachReasons.some((r) => r.includes('P0-20 ENFORCED'))).toBe(true);
    expect(res.autoNettingForbidden).toBe(true);
  });
});
