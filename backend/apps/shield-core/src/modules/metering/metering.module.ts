import { Module } from '@nestjs/common';
import {
  MeterDefinitionController,
  MeteringController,
} from './metering.controller';
import { MeterDefinitionService } from './meter-definition.service';
import { MeteringService } from './metering.service';
import { MeterGovernanceService } from './meter-governance.service';
import {
  MeterGovernanceController,
  PlatformMeterGovernanceController,
} from './meter-governance.controller';
import { UsageCorrectionController } from './usage-correction.controller';
import { UsageCorrectionService } from './usage-correction.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ApprovalsModule } from '../approvals/approvals.module';

@Module({
  imports: [PrismaModule, ApprovalsModule],
  controllers: [
    MeterDefinitionController,
    MeteringController,
    MeterGovernanceController,
    PlatformMeterGovernanceController,
    UsageCorrectionController,
  ],
  providers: [
    MeterDefinitionService,
    MeterGovernanceService,
    MeteringService,
    UsageCorrectionService,
  ],
  exports: [
    MeterDefinitionService,
    MeterGovernanceService,
    MeteringService,
    UsageCorrectionService,
  ],
})
export class MeteringModule {}

