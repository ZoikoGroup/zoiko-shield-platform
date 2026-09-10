import { Module } from '@nestjs/common';
import { SloMetricsExporterService } from './slo-metrics-exporter.service';
import { PrometheusMetricsController } from './prometheus-metrics.controller';

@Module({
  controllers: [PrometheusMetricsController],
  providers: [SloMetricsExporterService],
  exports: [SloMetricsExporterService],
})
export class ObservabilityExporterModule {}
