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

  it('should return correct pricing and allocations for Shield Essential ($2,000/mo)', () => {
    const essential = service.getPlanTierByKey('SHIELD_ESSENTIAL');
    expect(essential.pricing.monthlyUsd).toBe(2000);
    expect(essential.pricing.annualBilledMonthlyUsd).toBe(1800);
    expect(essential.allocations.maxProtectedAssets).toBe(250);
    expect(essential.allocations.includedTelemetryGbPerDay).toBe(10);
    expect(essential.allocations.incidentResponseSlaHours).toBe(4);
    expect(essential.includedOffers).toContain('CONTINUOUS_ASSURANCE');
    expect(essential.includedOffers).toContain('INCIDENT_RESPONSE_RETAINER');
  });

  it('should return correct pricing and allocations for Shield Professional ($4,000/mo)', () => {
    const pro = service.getPlanTierByKey('SHIELD_PROFESSIONAL');
    expect(pro.pricing.monthlyUsd).toBe(4000);
    expect(pro.allocations.maxProtectedAssets).toBe(1000);
    expect(pro.allocations.includedTelemetryGbPerDay).toBe(50);
    expect(pro.allocations.incidentResponseSlaHours).toBe(2);
    expect(pro.includedOffers).toContain('MANAGED_DEFENSE');
    expect(pro.includedOffers).toContain('CONTINUOUS_ASSURANCE');
    expect(pro.includedOffers).toContain('EXPOSURE_MANAGEMENT');
  });

  it('should return correct pricing and allocations for Shield Advanced ($8,000/mo)', () => {
    const advanced = service.getPlanTierByKey('SHIELD_ADVANCED');
    expect(advanced.pricing.monthlyUsd).toBe(8000);
    expect(advanced.allocations.maxProtectedAssets).toBe(5000);
    expect(advanced.allocations.includedTelemetryGbPerDay).toBe(250);
    expect(advanced.allocations.incidentResponseSlaHours).toBe(1);
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
