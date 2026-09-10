import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { ContinuousAssuranceController } from './continuous-assurance.controller';
import { ContinuousAssuranceService } from './continuous-assurance.service';
import { ContinuousAssuranceCollectorService } from './continuous-assurance-collector.service';
import { ComplianceDriftMonitorService } from './compliance-drift-monitor.service';
import { EvidenceDecayWorker } from './evidence-decay.worker';
import { DoraNis2PciEvaluatorService } from './dora-nis2-pci-evaluator.service';
import { CoreAssuranceEvaluatorService } from './core-assurance-evaluator.service';
import { Adr08SectorRegistryService } from './adr08-sector-registry.service';

@Module({
  imports: [PrismaModule, ApprovalsModule, EvidenceModule],
  controllers: [ContinuousAssuranceController],
  providers: [
    ContinuousAssuranceService,
    ContinuousAssuranceCollectorService,
    ComplianceDriftMonitorService,
    EvidenceDecayWorker,
    DoraNis2PciEvaluatorService,
    CoreAssuranceEvaluatorService,
    Adr08SectorRegistryService,
  ],
  exports: [
    ContinuousAssuranceService,
    ContinuousAssuranceCollectorService,
    ComplianceDriftMonitorService,
    EvidenceDecayWorker,
    DoraNis2PciEvaluatorService,
    CoreAssuranceEvaluatorService,
    Adr08SectorRegistryService,
  ],
})
export class ContinuousAssuranceModule {}
