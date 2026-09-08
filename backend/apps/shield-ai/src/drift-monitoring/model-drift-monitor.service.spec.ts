import { Test, TestingModule } from '@nestjs/testing';
import { ModelDriftMonitorService } from './model-drift-monitor.service';
import { NotFoundException } from '@nestjs/common';

describe('ModelDriftMonitorService (§21 Model Drift & Change Management)', () => {
  let service: ModelDriftMonitorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ModelDriftMonitorService],
    }).compile();

    service = module.get<ModelDriftMonitorService>(ModelDriftMonitorService);
    service.clearObservations();
  });

  afterEach(() => {
    service.clearObservations();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Baseline Registration and Drift Detection', () => {
    it('should register a baseline and classify stable inference telemetry as STABLE', () => {
      const modelId = 'model:triage-llm-v1';

      service.registerBaseline({
        modelId,
        version: '1.0.0',
        avgConfidence: 0.92,
        avgLatencyMs: 120,
        avgTokenCount: 350,
        categoryDistribution: {
          MALWARE: 0.4,
          PHISHING: 0.4,
          BENIGN: 0.2,
        },
      });

      // Simulate 20 stable observations (8 MALWARE, 8 PHISHING, 4 BENIGN) matching 40/40/20 baseline
      for (let i = 0; i < 20; i++) {
        let predictedCategory = 'BENIGN';
        if (i < 8) predictedCategory = 'MALWARE';
        else if (i < 16) predictedCategory = 'PHISHING';

        service.recordObservation({
          modelId,
          timestamp: new Date().toISOString(),
          confidenceScore: 0.91 + (i % 3) * 0.01,
          latencyMs: 118 + (i % 5),
          tokenCount: 350,
          predictedCategory,
        });
      }

      const evalResult = service.evaluateDrift(modelId);
      expect(evalResult.driftStatus).toBe('STABLE');
      expect(evalResult.recommendation).toBe('NO_ACTION');
      expect(evalResult.sampleSize).toBe(20);
    });

    it('should detect CRITICAL_DRIFT_DETECTED when confidence drops significantly or latency surges', () => {
      const modelId = 'model:incident-summary-v2';

      service.registerBaseline({
        modelId,
        version: '2.0.0',
        avgConfidence: 0.95,
        avgLatencyMs: 200,
        avgTokenCount: 500,
        categoryDistribution: { SEV1: 0.1, SEV2: 0.3, SEV3: 0.6 },
      });

      // Simulate massive degraded performance (confidence collapses to 0.45, latency surges 4x to 850ms)
      for (let i = 0; i < 25; i++) {
        service.recordObservation({
          modelId,
          timestamp: new Date().toISOString(),
          confidenceScore: 0.45,
          latencyMs: 850,
          tokenCount: 150,
          predictedCategory: 'SEV3',
        });
      }

      const evalResult = service.evaluateDrift(modelId);
      expect(evalResult.driftStatus).toBe('CRITICAL_DRIFT_DETECTED');
      expect(evalResult.recommendation).toBe(
        'TRIGGER_MODEL_FAILOVER_OR_CONTAINMENT',
      );
      expect(evalResult.confidenceShift).toBeGreaterThan(0.4);
      expect(evalResult.latencyMultiplier).toBeGreaterThan(3.0);
    });

    it('should throw NotFoundException if evaluating a model with no baseline profile', () => {
      expect(() => service.evaluateDrift('unknown-model')).toThrow(
        NotFoundException,
      );
    });
  });
});
