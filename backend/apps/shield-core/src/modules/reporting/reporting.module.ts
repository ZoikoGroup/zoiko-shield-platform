import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { ReportingController } from './reporting.controller';
import { ReportHealthPropagationService } from './source-health/report-health-propagation.service';
import { ReportingProjectionService } from './projections/reporting-projection.service';
import { ReportingProjectionRebuildService } from './projections/reporting-projection-rebuild.service';
import { ReportDefinitionService } from './snapshots/report-definition.service';
import { ReportSnapshotService } from './snapshots/report-snapshot.service';
import { OperationalReportService } from './operational/operational-report.service';
import { ExecutiveReportService } from './executive/executive-report.service';

@Module({
  imports: [PrismaModule, EvidenceModule],
  controllers: [ReportingController],
  providers: [
    ReportHealthPropagationService,
    ReportingProjectionService,
    ReportingProjectionRebuildService,
    ReportDefinitionService,
    ReportSnapshotService,
    OperationalReportService,
    ExecutiveReportService,
  ],
  exports: [ReportingProjectionService, ReportHealthPropagationService, ReportDefinitionService, ReportSnapshotService, OperationalReportService, ExecutiveReportService],
})
export class ReportingModule {}
