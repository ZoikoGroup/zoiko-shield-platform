import { Module } from '@nestjs/common';
import {
  AiGovernanceProfileController,
  InternalAiProviderCostController,
  AiUsageController,
  AiBudgetController,
} from './ai-governance.controller';
import { AiUsageService } from './ai-usage.service';
import { AiBudgetService } from './ai-budget.service';
import { AiGovernanceProfileService } from './ai-governance-profile.service';
import { AiProviderCostService } from './ai-provider-cost.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CommercialModule } from '../commercial/commercial.module';
import { MeteringModule } from '../metering/metering.module';
import { ApprovalsModule } from '../approvals/approvals.module';

@Module({
  imports: [PrismaModule, CommercialModule, MeteringModule, ApprovalsModule],
  controllers: [
    AiUsageController,
    InternalAiProviderCostController,
    AiGovernanceProfileController,
    AiBudgetController,
  ],
  providers: [
    AiUsageService,
    AiBudgetService,
    AiGovernanceProfileService,
    AiProviderCostService,
  ],
  exports: [
    AiUsageService,
    AiBudgetService,
    AiGovernanceProfileService,
    AiProviderCostService,
  ],
})
export class AiGovernanceModule {}
