import { Test, TestingModule } from '@nestjs/testing';
import { PrometheusMetricsService } from './prometheus-metrics.service';

describe('PrometheusMetricsService', () => {
  let service: PrometheusMetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrometheusMetricsService],
    }).compile();

    service = module.get<PrometheusMetricsService>(PrometheusMetricsService);
  });

  it('should be defined and register default metrics', () => {
    expect(service).toBeDefined();
    const output = service.exportPrometheusText();
    expect(output).toContain('zoiko_events_ingested_total');
    expect(output).toContain('zoiko_soar_actions_executed_total');
    expect(output).toContain('zoiko_ai_token_usage_total');
    expect(output).toContain('zoiko_active_tenants_total');
    expect(output).toContain('zoiko_detection_evaluation_duration_seconds');
  });

  it('increments counters with labels correctly', () => {
    service.incrementCounter('zoiko_events_ingested_total', 5, { tenant_id: 'ten-01', provider: 'okta' });
    service.incrementCounter('zoiko_events_ingested_total', 3, { tenant_id: 'ten-01', provider: 'okta' });

    const output = service.exportPrometheusText();
    expect(output).toContain('zoiko_events_ingested_total{provider="okta",tenant_id="ten-01"} 8');
  });

  it('updates gauge values accurately', () => {
    service.setGauge('zoiko_active_tenants_total', 42);
    const output = service.exportPrometheusText();
    expect(output).toContain('zoiko_active_tenants_total 42');
  });

  it('records histogram observations and computes sum and bucket counts', () => {
    service.observeHistogram('zoiko_detection_evaluation_duration_seconds', 0.02);
    service.observeHistogram('zoiko_detection_evaluation_duration_seconds', 0.15);

    const output = service.exportPrometheusText();
    expect(output).toContain('zoiko_detection_evaluation_duration_seconds_count 2');
    expect(output).toContain('zoiko_detection_evaluation_duration_seconds_bucket{le="+Inf"} 2');
    expect(output).toContain('zoiko_detection_evaluation_duration_seconds_sum 0.170000');
  });
});
