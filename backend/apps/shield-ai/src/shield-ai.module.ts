import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { KafkaModule } from './kafka/kafka.module';
import { ShieldAiController } from './shield-ai.controller';

import { MockModelProvider } from './provider-registry/mock-model-provider';
import { ProviderRegistryService } from './provider-registry/provider-registry.service';
import { ModelRegistryService } from './model-registry/model-registry.service';
import { PromptRegistryService } from './prompt-registry/prompt-registry.service';
import { AiUseCaseRegistryService } from './gateway/policy/ai-use-case-registry.service';
import { PolicyService } from './gateway/policy/policy.service';
import { AiGatewayService } from './gateway/ai-gateway.service';

import { RedactionService } from './redaction/redaction.service';
import { UsageControlService } from './usage-control/usage-control.service';
import { MemoryPolicyService } from './memory-policy/memory-policy.service';
import { CitationValidatorService } from './retrieval/citations/citation-validator.service';
import { EvaluationService } from './evaluation/evaluation.service';
import { RetrievalBrokerService } from './retrieval/retrieval-broker/retrieval-broker.service';
import { ToolBrokerService } from './tools/tool-broker/tool-broker.service';

import { ShieldCoreClient } from './internal-client/shield-core.client';

import { AiOutputService } from './outputs/ai-output.service';
import { AiHumanReviewService } from './outputs/ai-human-review.service';

import { CaseSummaryService } from './use-cases/case-summary/case-summary.service';
import { InvestigationHypothesisService } from './use-cases/investigation-hypothesis/investigation-hypothesis.service';
import { EntityExplanationService } from './use-cases/entity-explanation/entity-explanation.service';
import { NextQueryService } from './use-cases/next-query/next-query.service';
import { ResponseRecommendationService } from './use-cases/response-recommendation/response-recommendation.service';

import { UseCaseController } from './internal/use-case.controller';
import { AiOutputController } from './internal/ai-output.controller';

@Module({
  imports: [PrismaModule, KafkaModule],
  controllers: [ShieldAiController, UseCaseController, AiOutputController],
  providers: [
    MockModelProvider,
    ProviderRegistryService,
    ModelRegistryService,
    PromptRegistryService,
    AiUseCaseRegistryService,
    PolicyService,
    AiGatewayService,

    RedactionService,
    UsageControlService,
    MemoryPolicyService,
    CitationValidatorService,
    EvaluationService,
    RetrievalBrokerService,
    ToolBrokerService,

    ShieldCoreClient,

    AiOutputService,
    AiHumanReviewService,

    CaseSummaryService,
    InvestigationHypothesisService,
    EntityExplanationService,
    NextQueryService,
    ResponseRecommendationService,
  ],
})
export class ShieldAiModule {}
