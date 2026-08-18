import { Module } from '@nestjs/common';
import {
  AiUsageController,
  AiBudgetController,
} from './ai-governance.controller';
import { AiUsageService } from './ai-usage.service';
import { AiBudgetService } from './ai-budget.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CommercialModule } from '../commercial/commercial.module';
import { MeteringModule } from '../metering/metering.module';

@Module({
  imports: [PrismaModule, CommercialModule, MeteringModule],
  controllers: [AiUsageController, AiBudgetController],
  providers: [AiUsageService, AiBudgetService],
  exports: [AiUsageService, AiBudgetService],
})
export class AiGovernanceModule {}
