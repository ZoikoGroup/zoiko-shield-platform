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
import { PrismaModule } from '../../prisma/prisma.module';
import { ApprovalsModule } from '../approvals/approvals.module';

@Module({
  imports: [PrismaModule, ApprovalsModule],
  controllers: [
    MeterDefinitionController,
    MeteringController,
    MeterGovernanceController,
    PlatformMeterGovernanceController,
  ],
  providers: [MeterDefinitionService, MeterGovernanceService, MeteringService],
  exports: [MeterDefinitionService, MeterGovernanceService, MeteringService],
})
export class MeteringModule {}
