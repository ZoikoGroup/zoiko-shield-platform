import { Module } from '@nestjs/common';
import { SloMetricsExporterService } from './slo-metrics-exporter.service';
import { PrometheusMetricsController } from './prometheus-metrics.controller';
import { ServiceReadinessService } from './service-readiness.service';
import { ServiceReadinessController } from './service-readiness.controller';
import { BackupIntegrityService } from './backup-integrity.service';
import { RestoreDrillService } from './restore-drill.service';
import { BackupObservabilityController } from './backup-observability.controller';
import { SyntheticJourneyService } from './synthetic-journey.service';
import { GameDayRunnerService } from './game-day-runner.service';
import { SyntheticObservabilityController } from './synthetic-observability.controller';
import { PhaseExitGateService } from './phase-exit-gate.service';
import { PhaseProofExporterService } from './phase-proof-exporter.service';
import { PhaseExitGateController } from './phase-exit-gate.controller';

@Module({
  controllers: [
    PrometheusMetricsController,
    ServiceReadinessController,
    BackupObservabilityController,
    SyntheticObservabilityController,
    PhaseExitGateController,
  ],
  providers: [
    SloMetricsExporterService,
    ServiceReadinessService,
    BackupIntegrityService,
    RestoreDrillService,
    SyntheticJourneyService,
    GameDayRunnerService,
    PhaseExitGateService,
    PhaseProofExporterService,
  ],
  exports: [
    SloMetricsExporterService,
    ServiceReadinessService,
    BackupIntegrityService,
    RestoreDrillService,
    SyntheticJourneyService,
    GameDayRunnerService,
    PhaseExitGateService,
    PhaseProofExporterService,
  ],
})
export class ObservabilityExporterModule {}

