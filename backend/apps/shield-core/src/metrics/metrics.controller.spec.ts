import { Test, TestingModule } from '@nestjs/testing';
import { MetricsController } from './metrics.controller';
import { PrometheusMetricsService } from './prometheus-metrics.service';

describe('MetricsController', () => {
  let controller: MetricsController;
  let service: PrometheusMetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [PrometheusMetricsService],
    }).compile();

    controller = module.get<MetricsController>(MetricsController);
    service = module.get<PrometheusMetricsService>(PrometheusMetricsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns valid Prometheus metrics text on GET /metrics', () => {
    service.incrementCounter('zoiko_events_ingested_total', 10);
    const text = controller.getMetrics();

    expect(typeof text).toBe('string');
    expect(text).toContain('# TYPE zoiko_events_ingested_total counter');
    expect(text).toContain('zoiko_events_ingested_total 10');
  });
});
