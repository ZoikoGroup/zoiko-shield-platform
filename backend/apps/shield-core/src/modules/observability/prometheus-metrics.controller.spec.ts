import { Test, TestingModule } from '@nestjs/testing';
import { PrometheusMetricsController } from './prometheus-metrics.controller';
import { SloMetricsExporterService } from './slo-metrics-exporter.service';

describe('PrometheusMetricsController', () => {
  let controller: PrometheusMetricsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PrometheusMetricsController],
      providers: [SloMetricsExporterService],
    }).compile();

    controller = module.get<PrometheusMetricsController>(PrometheusMetricsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns valid Prometheus text format metrics with tenant labels', () => {
    const output = controller.getPrometheusMetrics('tenant-corp-01');

    expect(output).toContain('# HELP zoikoshield_ingest_acceptance_rate');
    expect(output).toContain('# TYPE zoikoshield_ingest_acceptance_rate gauge');
    expect(output).toContain('zoikoshield_ingest_acceptance_rate{tenant_id="tenant-corp-01",connector_state="HEALTHY"} 99.80');
    expect(output).toContain('zoikoshield_merkle_tree_leaves_total{tenant_id="tenant-corp-01"} 450');
    expect(output).toContain('zoikoshield_action_freeze_active{tenant_id="tenant-corp-01",scope="TENANT"} 0');
  });
});
