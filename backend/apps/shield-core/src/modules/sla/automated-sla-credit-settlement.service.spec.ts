import { AutomatedSlaCreditSettlementService } from './automated-sla-credit-settlement.service';

describe('AutomatedSlaCreditSettlementService', () => {
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
  });

  it('should automatically issue credit when availability drops below 99.99%', () => {
    const res = settlementService.evaluateAndSettleSlaCredits({
      tenantId: 'tenant-acme',
      billingPeriodMonth: '2026-08',
      measuredUptimePercent: 99.85, // 10% credit tier
      p1IncidentCount: 0,
      averageP1MttrMinutes: 0,
      monthlyContractValueUsd: 50000,
    });

    expect(res.isBreached).toBe(true);
    expect(res.creditPercentage).toBe(10);
    expect(res.creditAmountUsd).toBe(5000); // 10% of $50,000
    expect(res.invoiceAdjustmentStatus).toBe('CREDIT_ISSUED_AUTOMATICALLY');
    expect(res.breachReasons[0]).toContain('Availability Target Missed');
  });

  it('should calculate MTTR breach credit when P1 response time exceeds 60m', () => {
    const res = settlementService.evaluateAndSettleSlaCredits({
      tenantId: 'tenant-acme',
      billingPeriodMonth: '2026-08',
      measuredUptimePercent: 99.999,
      p1IncidentCount: 2,
      averageP1MttrMinutes: 75, // Severe breach (> 60m)
      monthlyContractValueUsd: 100000,
    });

    expect(res.isBreached).toBe(true);
    expect(res.creditPercentage).toBe(30);
    expect(res.creditAmountUsd).toBe(30000); // 30% of $100,000
  });
});
