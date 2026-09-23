import { Module } from '@nestjs/common';
import {
  AiGovernanceProfileController,
  InternalAiProviderCostController,
  InternalNoLlmContinuityController,
  AiUsageController,
  AiBudgetController,
} from './ai-governance.controller';
import { CustomerDisclosuresController } from './customer-disclosures.controller';
import { G1GateController } from './g1-gate.controller';
import { G1GateService } from './g1-gate.service';
import { AiProxyController } from './ai-proxy.controller';
import { ShieldAiClient } from '../../internal-client/shield-ai.client';
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
    G1GateController,
    AiProxyController,
  ],
  providers: [
    ShieldAiClient,
    AiUsageService,
    AiBudgetService,
    AiGovernanceProfileService,
    AiProviderCostService,
    NoLlmContinuityService,
    AiTokenQuotaGuard,
    AiOutputGroundingService,
    G1GateService,
  ],
  exports: [
    ShieldAiClient,
    AiUsageService,
    AiBudgetService,
    AiGovernanceProfileService,
    AiProviderCostService,
    NoLlmContinuityService,
    AiTokenQuotaGuard,
    AiOutputGroundingService,
    G1GateService,
  ],
})
export class AiGovernanceModule {}
