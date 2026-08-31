import { Module } from '@nestjs/common';
import { SloMetricsExporterService } from './slo-metrics-exporter.service';

@Module({
  providers: [SloMetricsExporterService],
  exports: [SloMetricsExporterService],
})
export class ObservabilityExporterModule {}
