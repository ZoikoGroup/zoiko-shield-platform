import { Module } from '@nestjs/common';
import {
  AiGovernanceProfileController,
  InternalAiProviderCostController,
  InternalNoLlmContinuityController,
  AiUsageController,
  AiBudgetController,
} from './ai-governance.controller';
import { CustomerDisclosuresController } from './customer-disclosures.controller';
import { AiUsageService } from './ai-usage.service';
import { AiBudgetService } from './ai-budget.service';
import { AiGovernanceProfileService } from './ai-governance-profile.service';
import { AiProviderCostService } from './ai-provider-cost.service';
import { AiTokenQuotaGuard } from './ai-token-quota.guard';
import { PrismaModule } from '../../prisma/prisma.module';
import { CommercialModule } from '../commercial/commercial.module';
import { MeteringModule } from '../metering/metering.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { AuthorizationDecisionModule } from '../authorization-decision/authorization-decision.module';
import { NoLlmContinuityService } from './no-llm-continuity.service';
import { AiOutputGroundingService } from './ai-output-grounding.service';

@Module({
  imports: [
    PrismaModule,
    CommercialModule,
    MeteringModule,
    ApprovalsModule,
    EvidenceModule,
    AuthorizationDecisionModule,
  ],
  controllers: [
    AiUsageController,
    InternalAiProviderCostController,
    InternalNoLlmContinuityController,
    AiGovernanceProfileController,
    AiBudgetController,
    CustomerDisclosuresController,
  ],
  providers: [
    AiUsageService,
    AiBudgetService,
    AiGovernanceProfileService,
    AiProviderCostService,
    NoLlmContinuityService,
    AiTokenQuotaGuard,
    AiOutputGroundingService,
  ],
  exports: [
    AiUsageService,
    AiBudgetService,
    AiGovernanceProfileService,
    AiProviderCostService,
    NoLlmContinuityService,
    AiTokenQuotaGuard,
    AiOutputGroundingService,
  ],
})
export class AiGovernanceModule {}
