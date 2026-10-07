import { Module } from '@nestjs/common';
import {
  PlatformSectorPackController,
  SectorPackAvailabilityController,
} from './sector-pack.controller';
import { SectorPackService } from './sector-pack.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ApprovalsModule } from '../approvals/approvals.module';

import { DoraComplianceService } from './dora-compliance.service';
import { Nis2ComplianceService } from './nis2-compliance.service';
import { PciDssComplianceService } from './pci-dss-compliance.service';

@Module({
  imports: [PrismaModule, ApprovalsModule],
  controllers: [PlatformSectorPackController, SectorPackAvailabilityController],
  providers: [
    SectorPackService,
    DoraComplianceService,
    Nis2ComplianceService,
    PciDssComplianceService,
  ],
  exports: [
    SectorPackService,
    DoraComplianceService,
    Nis2ComplianceService,
    PciDssComplianceService,
  ],
})
export class SectorPacksModule {}
