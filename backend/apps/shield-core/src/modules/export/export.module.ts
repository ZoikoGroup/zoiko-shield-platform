import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { AuthorizationDecisionModule } from '../authorization-decision/authorization-decision.module';
import { OutboxService } from '../../outbox/outbox.service';
import { ExportController } from './export.controller';
import { ExportJobService } from './jobs/export-job.service';
import { ExportBuilderService } from './builders/export-builder.service';
import { ExportManifestService } from './manifests/export-manifest.service';
import { ExportWorkerService } from './workers/export-worker.service';
import { ExportDownloadService } from './download/export-download.service';

@Module({
  imports: [PrismaModule, EvidenceModule, AuthorizationDecisionModule],
  controllers: [ExportController],
  providers: [
    OutboxService,
    ExportJobService,
    ExportBuilderService,
    ExportManifestService,
    ExportWorkerService,
    ExportDownloadService,
  ],
  exports: [ExportJobService, ExportWorkerService],
})
export class ExportModule {}
