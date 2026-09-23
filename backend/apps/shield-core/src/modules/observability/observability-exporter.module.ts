import { Module } from '@nestjs/common';
import { SloMetricsExporterService } from './slo-metrics-exporter.service';
import { PrometheusMetricsController } from './prometheus-metrics.controller';
import { ServiceReadinessService } from './service-readiness.service';
import { ServiceReadinessController } from './service-readiness.controller';
import { BackupIntegrityService } from './backup-integrity.service';
import { RestoreDrillService } from './restore-drill.service';
import { BackupObservabilityController } from './backup-observability.controller';

@Module({
  controllers: [
    PrometheusMetricsController,
    ServiceReadinessController,
    BackupObservabilityController,
  ],
  providers: [
    SloMetricsExporterService,
    ServiceReadinessService,
    BackupIntegrityService,
    RestoreDrillService,
  ],
  exports: [
    SloMetricsExporterService,
    ServiceReadinessService,
    BackupIntegrityService,
    RestoreDrillService,
  ],
})
export class ObservabilityExporterModule {}

