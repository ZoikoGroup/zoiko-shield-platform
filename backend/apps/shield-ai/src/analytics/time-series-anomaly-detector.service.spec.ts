import { Test, TestingModule } from '@nestjs/testing';
import { TimeSeriesAnomalyDetectorService } from './time-series-anomaly-detector.service';

describe('TimeSeriesAnomalyDetectorService', () => {
  let service: TimeSeriesAnomalyDetectorService;
  const tenantId = 'tenant-anomaly-test-104';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TimeSeriesAnomalyDetectorService],
    }).compile();

    service = module.get<TimeSeriesAnomalyDetectorService>(
      TimeSeriesAnomalyDetectorService,
    );
  });

  it('should establish a stable baseline for normal telemetry samples', () => {
    // Feed 20 steady normal samples (mean ~100, variance ~2)
    for (let i = 0; i < 20; i++) {
      const normalValue = 100 + (i % 3) - 1;
      const res = service.recordSample(
        tenantId,
        'egress_bytes_per_sec',
        normalValue,
      );
      expect(res.isAnomaly).toBe(false);
      expect(res.severity).toBe('NORMAL');
    }

    const baseline = service.getBaseline(tenantId, 'egress_bytes_per_sec');
    expect(baseline).toBeDefined();
    expect(baseline?.count).toBe(20);
    expect(Math.round(baseline?.mean || 0)).toBe(100);
  });

  it('should trigger a CRITICAL anomaly and tag MITRE TTP when a massive spike occurs', () => {
    // Train baseline with 15 normal samples
    for (let i = 0; i < 15; i++) {
      service.recordSample(tenantId, 'login_failed_rate', 5 + (i % 2));
    }

    // Inject massive spike (150 failures/sec vs baseline 5)
    const anomalyRes = service.recordSample(tenantId, 'login_failed_rate', 150);

    expect(anomalyRes.isAnomaly).toBe(true);
    expect(anomalyRes.severity).toBe('CRITICAL');
    expect(anomalyRes.zScore).toBeGreaterThan(4.5);
    expect(anomalyRes.suggestedMitreTtp).toContain('T1110');
  });
});
