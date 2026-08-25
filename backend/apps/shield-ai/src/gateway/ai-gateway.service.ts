import { Injectable, Logger } from '@nestjs/common';
import { PolicyService } from './policy/policy.service';
import { PromptRegistryService } from '../prompt-registry/prompt-registry.service';
import { ProviderRegistryService } from '../provider-registry/provider-registry.service';
import { RetrievalBrokerService } from '../retrieval/retrieval-broker/retrieval-broker.service';
import { EvaluationService } from '../evaluation/evaluation.service';
import { RedactionService } from '../redaction/redaction.service';
import { UsageControlService } from '../usage-control/usage-control.service';
import { MemoryPolicyService } from '../memory-policy/memory-policy.service';
import { AiOutputService } from '../outputs/ai-output.service';
import { AiKillSwitchService } from '../kill-switch/ai-kill-switch.service';
import { ShieldCoreClient } from '../internal-client/shield-core.client';
import {
  AiUnavailableException,
  PolicyDeniedException,
} from './fallback/fallback.exceptions';
import {
  KafkaProducerService,
  CANONICAL_TOPICS,
} from '../kafka/kafka-producer.service';

export interface GatewayRequestContext {
  tenantId: string;
  environmentId: string;
  region: string;
  dataClass: string;
  purpose: string;
  actorId: string;
  caseId?: string;
  authorizationDecisionId: string;
  correlationId: string;
  traceId: string;
}

/**
 * The single orchestration point every AI use case runs through (spec §2).
 * The MockModelProvider is dispatched only after the exact same
 * policy/residency/kill-switch checks a real provider would go through —
 * swapping providers later can never bypass this authorization behavior.
 */
@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);

  constructor(
    private readonly policyService: PolicyService,
    private readonly promptRegistry: PromptRegistryService,
    private readonly providerRegistry: ProviderRegistryService,
    private readonly retrievalBroker: RetrievalBrokerService,
    private readonly evaluationService: EvaluationService,
    private readonly redactionService: RedactionService,
    private readonly usageControl: UsageControlService,
    private readonly memoryPolicy: MemoryPolicyService,
    private readonly aiOutputService: AiOutputService,
    private readonly kafkaProducer: KafkaProducerService,
    private readonly killSwitch: AiKillSwitchService,
    private readonly shieldCore: ShieldCoreClient,
  ) {}

  async invoke(
    useCaseKey: string,
    promptKey: string,
    context: GatewayRequestContext,
  ) {
    this.killSwitch.assertNotBlocked({
      tenantId: context.tenantId,
      useCaseKey,
      promptKey,
    });

    this.memoryPolicy.assertRequestScoped({
      tenantId: context.tenantId,
      caseId: context.caseId,
    });

    const usage = this.usageControl.checkAndIncrement(context.tenantId);
    if (!usage.allowed) {
      throw new AiUnavailableException(
        'Per-tenant AI request budget exceeded for this window',
      );
    }

    const policyResult = await this.policyService.evaluate(useCaseKey, context);
    if (!policyResult.allowed) {
      await this.kafkaProducer.publishEvent(
        CANONICAL_TOPICS.AI_FAILED,
        'ai.failed',
        {
          tenantId: context.tenantId,
          useCaseKey,
          code: policyResult.denialCode,
          reason: policyResult.reason,
        },
        { correlationId: context.correlationId },
      );
      if (policyResult.denialCode === 'AI_UNAVAILABLE') {
        throw new AiUnavailableException(
          policyResult.reason ?? 'AI unavailable',
        );
      }
      throw new PolicyDeniedException(policyResult.reason ?? 'Policy denied');
    }

    const { useCase, modelProfile, governanceProfile } = policyResult;
    const prompt = await this.promptRegistry.getActiveForKey(promptKey);

    if (!context.caseId) {
      throw new PolicyDeniedException(
        'This use case requires a caseId for retrieval scoping',
      );
    }

    const { bundle, sourceRefs, retrievalContext } =
      await this.retrievalBroker.build({
        tenantId: context.tenantId,
        environmentId: context.environmentId,
        purpose: context.purpose,
        caseId: context.caseId,
      });

    const { redacted: redactedContext } =
      this.redactionService.redact(retrievalContext);

    await this.kafkaProducer.publishEvent(
      CANONICAL_TOPICS.AI_REQUESTED,
      'ai.requested',
      { tenantId: context.tenantId, useCaseKey, caseId: context.caseId },
      { correlationId: context.correlationId },
    );

    const provider = this.providerRegistry.get(modelProfile!.provider);
    const outputSchema = JSON.parse(prompt.output_schema || '{}');
    const invocationResult = await provider.invoke({
      systemPrompt: prompt.system_prompt_ref,
      userInput: context.purpose,
      retrievalContext: redactedContext,
      outputSchema,
    });

    await this.shieldCore.recordAiUsage({
      tenantId: context.tenantId,
      environmentId: context.environmentId,
      governanceProfileId: governanceProfile?.id || 'gp-default',
      useCaseKey,
      workflow: useCaseKey,
      workflowClass: useCase?.risk_class || 'LOW',
      region: context.region,
      provider: modelProfile!.provider,
      model: modelProfile!.model,
      modelProfileId: modelProfile!.id,
      modelClass: invocationResult.usage?.modelClass ?? 'STANDARD',
      inputTokens: invocationResult.usage?.inputTokens ?? 0,
      outputTokens: invocationResult.usage?.outputTokens ?? 0,
      toolCalls: 0,
      retrievalCalls: 1,
      retrievalUnits: sourceRefs.length,
      storageByteHours: Buffer.byteLength(
        typeof invocationResult.content === 'string'
          ? invocationResult.content
          : JSON.stringify(invocationResult.content || {}),
        'utf8',
      ),
      contractedUsageUnits: 1,
      complexityUnits: 0,
      internalCost: invocationResult.usage?.internalCost ?? 0,
      internalCostSource:
        invocationResult.usage?.internalCostSource ?? 'PROVIDER_NOT_REPORTED',
      providerPriceVersion: invocationResult.usage?.providerPriceVersion,
    });

    const evaluation = this.evaluationService.evaluate({
      citedSourceRefs: invocationResult.citedSourceRefs,
      bundleSourceRefs: sourceRefs,
      completenessState: bundle.completeness_state,
      freshnessState: bundle.freshness_state,
      modelConfidence: invocationResult.confidence,
    });

    const output = await this.aiOutputService.create({
      tenantId: context.tenantId,
      environmentId: context.environmentId,
      useCaseId: useCase!.id,
      modelProfileId: modelProfile!.id,
      promptProfileId: prompt.id,
      retrievalBundleId: bundle.id,
      outputType: useCaseKey,
      content: invocationResult.content,
      citations: evaluation.citations.validatedCitations,
      limitations: evaluation.limitations,
      safetyResult: evaluation.safetyResult,
      authorizationDecisionId: context.authorizationDecisionId,
      correlationId: context.correlationId,
    });

    return output;
  }
}
