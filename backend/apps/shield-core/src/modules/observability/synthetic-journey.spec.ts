import { Test, TestingModule } from '@nestjs/testing';
import { SyntheticJourneyService } from './synthetic-journey.service';

describe('SyntheticJourneyService (Spec §27 Synthetic Monitoring & Canaries)', () => {
  let service: SyntheticJourneyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SyntheticJourneyService],
    }).compile();

    service = module.get<SyntheticJourneyService>(SyntheticJourneyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('executes all 6 journey stages on canary tenant with valid cryptographic receipt', () => {
    const report = service.executeJourneyProbe(
      'tenant-zoiko-canary-01',
      'eu-west-1',
    );

    expect(report.status).toBe('HEALTHY');
    expect(report.stagesPassed).toBe(6);
    expect(report.totalStages).toBe(6);
    expect(report.stages.length).toBe(6);
    expect(report.cryptographicProbeReceipt).toHaveLength(64);

    const stageNames = report.stages.map((s) => s.stage);
    expect(stageNames).toContain('STAGE_1_IDENTITY_AUTH');
    expect(stageNames).toContain('STAGE_2_INGEST_STREAM');
    expect(stageNames).toContain('STAGE_3_DETECTION_PIPELINE');
    expect(stageNames).toContain('STAGE_4_SOAR_SANDBOX');
    expect(stageNames).toContain('STAGE_5_LEDGER_PROOF');
    expect(stageNames).toContain('STAGE_6_AI_COPILOT_FALLBACK');
  });

  it('evaluates canary health posture and promotion eligibility', () => {
    // Seed 5 successful probes
    for (let i = 0; i < 5; i++) {
      service.executeJourneyProbe('tenant-zoiko-canary-01', 'eu-west-1');
    }

    const posture = service.getCanaryPosture('tenant-zoiko-canary-01');

    expect(posture.canaryTenantId).toBe('tenant-zoiko-canary-01');
    expect(posture.isCanaryHealthy).toBe(true);
    expect(posture.successRate24h).toBeGreaterThanOrEqual(99.0);
    expect(posture.consecutiveSuccesses).toBeGreaterThanOrEqual(5);
    expect(posture.promotionEligible).toBe(true);
  });

  it('provides synthetic health signal for Spec §31 readiness integration', () => {
    const healthy = service.isSyntheticMonitoringHealthy();
    expect(healthy).toBe(true);
  });
});
