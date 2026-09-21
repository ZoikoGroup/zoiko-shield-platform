import { Test, TestingModule } from '@nestjs/testing';
import { PlanTierService } from './plan-tier.service';
import { OfferEntitlementService } from '../offer-entitlement.service';

describe('PlanTierService', () => {
  let service: PlanTierService;

  const mockOfferEntitlementService = {
    checkEntitlement: jest.fn().mockResolvedValue(true),
    assertOfferEntitled: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanTierService,
        {
          provide: OfferEntitlementService,
          useValue: mockOfferEntitlementService,
        },
      ],
    }).compile();

    service = module.get<PlanTierService>(PlanTierService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return exactly 4 approved plan tiers', () => {
    const plans = service.getAllPlanTiers();
    expect(plans.length).toBe(4);

    const keys = plans.map((p) => p.key);
    expect(keys).toEqual([
      'SHIELD_ESSENTIAL',
      'SHIELD_PROFESSIONAL',
      'SHIELD_ADVANCED',
      'SHIELD_ENTERPRISE',
    ]);
  });

  // ZS-COM-BILL-001 §161 / ADR-06 / ADR-07: no public price or SLA until the
  // price book and contractual SLAs are approved. These used to assert
  // $2,000 / $4,000 / $8,000 and 4h / 2h / 1h - i.e. they locked the
  // unapproved commitments in place.
  it('publishes no price and no SLA for any tier while ADR-06/ADR-07 are open', () => {
    for (const plan of service.getAllPlanTiers()) {
      expect(plan.pricing.monthlyUsd).toBeNull();
      expect(plan.pricing.annualBilledMonthlyUsd).toBeNull();
      expect(plan.pricing.isContractOnly).toBe(true);
      expect(plan.allocations.incidentResponseSlaHours).toBeNull();
      const text = [
        ...plan.highlightedFeatures,
        ...plan.governanceFeatures,
        plan.supportModel,
      ].join(' ');
      expect(text).not.toMatch(
        /\b\d+\s*-?\s*(?:h|hour)s?\b.*\bSLA\b|\bSLA\b.*\b\d+\s*h\b/i,
      );
    }
  });

  it('keeps the sizing bands the recommender uses', () => {
    const essential = service.getPlanTierByKey('SHIELD_ESSENTIAL');
    expect(essential.allocations.maxProtectedAssets).toBe(250);
    expect(essential.allocations.includedTelemetryGbPerDay).toBe(10);
    expect(essential.includedOffers).toContain('CONTINUOUS_ASSURANCE');
    expect(essential.includedOffers).toContain('INCIDENT_RESPONSE_RETAINER');

    const pro = service.getPlanTierByKey('SHIELD_PROFESSIONAL');
    expect(pro.allocations.maxProtectedAssets).toBe(1000);
    expect(pro.allocations.includedTelemetryGbPerDay).toBe(50);
    expect(pro.includedOffers).toContain('MANAGED_DEFENSE');

    const advanced = service.getPlanTierByKey('SHIELD_ADVANCED');
    expect(advanced.allocations.maxProtectedAssets).toBe(5000);
    expect(advanced.allocations.includedTelemetryGbPerDay).toBe(250);
    expect(advanced.includedOffers).toContain('AI_SECURITY');
  });

  it('should recommend correct plan tier based on assets and requirements', () => {
    // Small org -> Essential
    const r1 = service.recommendPlan({
      protectedAssetCount: 150,
      estimatedDailyTelemetryGb: 5,
    });
    expect(r1.recommendedPlan.key).toBe('SHIELD_ESSENTIAL');

    // MDR required -> Professional
    const r2 = service.recommendPlan({
      protectedAssetCount: 200,
      estimatedDailyTelemetryGb: 8,
      requiresManagedDefense: true,
    });
    expect(r2.recommendedPlan.key).toBe('SHIELD_PROFESSIONAL');

    // AI Security required -> Advanced
    const r3 = service.recommendPlan({
      protectedAssetCount: 300,
      estimatedDailyTelemetryGb: 15,
      requiresAiSecurity: true,
    });
    expect(r3.recommendedPlan.key).toBe('SHIELD_ADVANCED');

    // Massive enterprise scale -> Enterprise
    const r4 = service.recommendPlan({
      protectedAssetCount: 10000,
      estimatedDailyTelemetryGb: 500,
    });
    expect(r4.recommendedPlan.key).toBe('SHIELD_ENTERPRISE');
  });
});
