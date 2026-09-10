import { Test, TestingModule } from '@nestjs/testing';
import { AiDriftMonitorService } from './ai-drift-monitor.service';
import { ModelDriftMonitorService } from './model-drift-monitor.service';
import { AiKillSwitchService } from '../kill-switch/ai-kill-switch.service';
import { SafeDegradationService } from '../degradation/safe-degradation.service';

describe('AiDriftMonitorService', () => {
  let service: AiDriftMonitorService;
  let driftService: ModelDriftMonitorService;
  let killSwitchService: AiKillSwitchService;

  const modelId = 'gemini-1.5-pro-threat-triage';
  const tenantId = 'tenant-acme-bank-01';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiDriftMonitorService,
        ModelDriftMonitorService,
        AiKillSwitchService,
        SafeDegradationService,
      ],
    }).compile();

    service = module.get<AiDriftMonitorService>(AiDriftMonitorService);
    driftService = module.get<ModelDriftMonitorService>(ModelDriftMonitorService);
    killSwitchService = module.get<AiKillSwitchService>(AiKillSwitchService);

    // Register baseline profile
    driftService.registerBaseline({
      modelId,
      version: 'v2.4.0',
      avgConfidence: 0.95,
      avgLatencyMs: 120,
      avgTokenCount: 450,
      categoryDistribution: {
        CREDENTIAL_ATTACK: 0.5,
        LATERAL_MOVEMENT: 0.3,
        DATA_EXFILTRATION: 0.2,
      },
    });
  });

  it('should maintain nominal status when live telemetry exhibits minimal drift', async () => {
    // Record nominal observations matching baseline distribution (5:3:2 ratio)
    const categories = [
      'CREDENTIAL_ATTACK',
      'CREDENTIAL_ATTACK',
      'CREDENTIAL_ATTACK',
      'CREDENTIAL_ATTACK',
      'CREDENTIAL_ATTACK',
      'LATERAL_MOVEMENT',
      'LATERAL_MOVEMENT',
      'LATERAL_MOVEMENT',
      'DATA_EXFILTRATION',
      'DATA_EXFILTRATION',
    ];

    for (const cat of categories) {
      driftService.recordObservation({
        modelId,
        timestamp: new Date().toISOString(),
        confidenceScore: 0.94,
        latencyMs: 122,
        tokenCount: 455,
        predictedCategory: cat,
      });
    }

    const report = await service.evaluateAndEnforce(modelId, tenantId);

    expect(report.evaluation.driftStatus).toBe('STABLE');
    expect(report.killSwitchEngaged).toBe(false);
    expect(report.activeFallbackMode).toBe(false);
    expect(report.resolution.actionRequired).toBe('PROCEED');
  });

  it('should automatically engage kill switch and fallback mode when PSI drift exceeds critical threshold (PSI >= 0.25)', async () => {
    // Record severe confidence and latency degradation
    for (let i = 0; i < 15; i++) {
      driftService.recordObservation({
        modelId,
        timestamp: new Date().toISOString(),
        confidenceScore: 0.40, // Severe drop from 0.95 (shift: 0.55)
        latencyMs: 500, // 4x baseline latency
        tokenCount: 900,
        predictedCategory: 'UNKNOWN_ANOMALY',
      });
    }

    const report = await service.evaluateAndEnforce(modelId, tenantId);

    expect(report.evaluation.driftStatus).toBe('CRITICAL_DRIFT_DETECTED');
    expect(report.evaluation.psiScore).toBeGreaterThanOrEqual(0.25);
    expect(report.killSwitchEngaged).toBe(true);
    expect(report.activeFallbackMode).toBe(true);
    expect(report.resolution.actionRequired).toBe('FALLBACK_DETERMINISTIC');

    // Verify kill-switch state
    const killCheck = killSwitchService.isBlocked({
      tenantId,
      modelRoute: modelId,
    });

    expect(killCheck.blocked).toBe(true);
    expect(killCheck.reason).toContain('AUTOMATED_DRIFT_CONTAINMENT');
  });
});
