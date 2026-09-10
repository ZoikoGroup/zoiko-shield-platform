import { Test, TestingModule } from '@nestjs/testing';
import { AiSupplyChainService } from './ai-supply-chain.service';

describe('AiSupplyChainService (§24 AI Supply Chain & Concentration Risk)', () => {
  let service: AiSupplyChainService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AiSupplyChainService],
    }).compile();

    service = module.get<AiSupplyChainService>(AiSupplyChainService);
    service.clearUsage();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Herfindahl-Hirschman Index (HHI) Concentration Analysis', () => {
    it('should calculate HIGH_CONCENTRATION_RISK when 95% of traffic is routed to a single provider (HHI > 2500)', () => {
      // 95% Anthropic, 5% OpenAI
      service.recordInferenceUsage('anthropic', 950);
      service.recordInferenceUsage('openai', 50);

      const report = service.assessConcentrationRisk();

      expect(report.concentrationRiskLevel).toBe('HIGH_CONCENTRATION_RISK');
      expect(report.hhiScore).toBeGreaterThan(8000);
      expect(report.providerDistribution['anthropic'].percentage).toBe(95);
    });

    it('should calculate LOW_DIVERSIFIED when traffic is evenly balanced across 8 providers (HHI < 1500)', () => {
      // 8 providers with 12.5% traffic each -> HHI = 8 * (12.5)^2 = 1250 < 1500
      const providers = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
      providers.forEach((p) => service.recordInferenceUsage(p, 125));

      const report = service.assessConcentrationRisk();

      expect(report.concentrationRiskLevel).toBe('LOW_DIVERSIFIED');
      expect(report.hhiScore).toBeLessThan(1500);
    });
  });

  describe('Tier-1 Mission Critical Fallback Redundancy Checks', () => {
    it('should flag Tier-1 use cases that lack an independent secondary provider fallback', () => {
      // Register Tier-1 mission critical use case with SAME primary and fallback
      service.registerUseCaseFallback({
        useCaseKey: 'TIER_1_SOC_ALERT_TRIAGE',
        criticalityTier: 'TIER_1_MISSION_CRITICAL',
        primaryProvider: 'anthropic',
        fallbackProvider: 'anthropic', // Single point of failure!
        fallbackModel: 'claude-3-haiku',
        fallbackReady: false,
      });

      // Register healthy Tier-1 use case with distinct secondary provider
      service.registerUseCaseFallback({
        useCaseKey: 'TIER_1_FIREWALL_VALIDATION',
        criticalityTier: 'TIER_1_MISSION_CRITICAL',
        primaryProvider: 'anthropic',
        fallbackProvider: 'openai',
        fallbackModel: 'gpt-4o-mini',
        fallbackReady: true,
      });

      const report = service.assessConcentrationRisk();
      expect(report.missingFallbackUseCases).toContain(
        'TIER_1_SOC_ALERT_TRIAGE',
      );
      expect(report.missingFallbackUseCases).not.toContain(
        'TIER_1_FIREWALL_VALIDATION',
      );
    });
  });

  describe('Data Sovereignty Zone Verification', () => {
    it('should flag providers whose data residency zone does not match tenant jurisdiction (e.g. EU boundary)', () => {
      const report = service.assessConcentrationRisk('EU');

      expect(report.dataSovereigntyWarnings.length).toBeGreaterThan(0);
      const hasUsWarning = report.dataSovereigntyWarnings.some(
        (w) => w.includes('anthropic') && w.includes('US'),
      );
      expect(hasUsWarning).toBe(true);
    });
  });
});
