import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CaseService } from './case.service';
import { CaseTimelineService } from '../timeline/case-timeline.service';
import { EvidenceService } from '../../evidence/services/evidence.service';
import {
  assertPermittedAuthorization,
  AuthorizationDecisionService,
} from '../../authorization-decision/authorization-decision.service';
import {
  ShieldAiClient,
  AiRequestContext,
} from '../../../internal-client/shield-ai.client';
import { NoLlmContinuityService } from '../../ai-governance/no-llm-continuity.service';

const AI_USE_CASE_KEYS: Record<string, string> = {
  summary: 'CASE_SUMMARY',
  hypotheses: 'INVESTIGATION_HYPOTHESIS',
  'next-queries': 'NEXT_QUERY_SUGGESTION',
  'response-recommendation': 'RESPONSE_RECOMMENDATION',
};

/**
 * Every AI interaction is Frontend -> shield-core -> authorization ->
 * shield-ai internal API (spec correction #5). shield-ai is never called
 * directly by anything outside this service.
 */
@Injectable()
export class CaseAiService {
  private readonly logger = new Logger(CaseAiService.name);

  constructor(
    private readonly caseService: CaseService,
    private readonly timeline: CaseTimelineService,
    private readonly evidenceService: EvidenceService,
    private readonly authorizationDecisionService: AuthorizationDecisionService,
    private readonly shieldAiClient: ShieldAiClient,
    private readonly continuity: NoLlmContinuityService,
  ) {}

  private isAiUnavailable(error: unknown): boolean {
    if (!(error instanceof ServiceUnavailableException)) return false;
    const response = error.getResponse();
    if (error.message === 'AI_UNAVAILABLE' || response === 'AI_UNAVAILABLE') {
      return true;
    }
    return (
      typeof response === 'object' &&
      response !== null &&
      'message' in response &&
      (response as { message?: unknown }).message === 'AI_UNAVAILABLE'
    );
  }

  async invoke(params: {
    tenantId: string;
    environmentId?: string;
    caseId: string;
    useCaseSlug: keyof typeof AI_USE_CASE_KEYS;
    actorId: string;
  }) {
    const caseRow = await this.caseService.assertTenantOwnership(
      params.tenantId,
      params.caseId,
    );

    const authorization = await this.authorizationDecisionService.evaluate({
      actorId: params.actorId,
      tenantId: params.tenantId,
      action: 'ai:invoke_use_case',
      resourceType: 'CASE',
      resourceId: params.caseId,
    });
    assertPermittedAuthorization(
      authorization,
      'Actor is not authorized to request AI assistance on this case',
    );
    const { authorizationDecisionId } = authorization;

    const correlationId = randomUUID();
    const context: AiRequestContext = {
      tenantId: params.tenantId,
      environmentId: params.environmentId ?? caseRow.environment_id,
      region: caseRow.region,
      dataClass: 'CASE_INVESTIGATION',
      purpose: AI_USE_CASE_KEYS[params.useCaseSlug],
      actorId: params.actorId,
      caseId: params.caseId,
      authorizationDecisionId,
      correlationId,
      traceId: randomUUID(),
      policyVersion: '1.0',
    };

    let aiOutput: Record<string, any>;
    let deterministicFallback = false;
    try {
      const result = await this.shieldAiClient.requestUseCase(
        AI_USE_CASE_KEYS[params.useCaseSlug],
        context,
        { caseId: params.caseId },
      );
      aiOutput = result.data;
    } catch (error) {
      if (!this.isAiUnavailable(error)) throw error;

      deterministicFallback = true;
      const fallback = await this.continuity.evaluate({
        tenantId: params.tenantId,
        environmentId: context.environmentId,
        actorId: params.actorId,
        operation: 'CORE_CASE_FALLBACK',
        facts: {
          useCase: AI_USE_CASE_KEYS[params.useCaseSlug],
          caseId: caseRow.id,
          title: caseRow.title,
          status: caseRow.status,
          severity: caseRow.severity,
          priority: caseRow.priority,
        },
      });
      const fallbackResult = fallback.result as Record<string, unknown>;
      aiOutput = {
        id: `continuity-${fallback.continuityEventId}`,
        outputType: 'DETERMINISTIC_FALLBACK',
        content: fallbackResult,
        citations: [],
        limitations: fallbackResult.limitations,
        safetyResult: 'DETERMINISTIC_NO_LLM',
        reviewStatus: 'HUMAN_REVIEW_REQUIRED',
        deterministic: true,
        llmUsed: false,
        continuityEventId: fallback.continuityEventId,
        inputHash: fallback.inputHash,
        outputHash: fallback.outputHash,
      };
      this.logger.warn(
        `shield-ai unavailable; deterministic fallback ${fallback.continuityEventId} returned for case ${caseRow.id}`,
      );
    }

    await this.timeline.append({
      tenantId: params.tenantId,
      caseId: params.caseId,
      entryType: 'DECISION_RECORDED',
      actorId: params.actorId,
      title: deterministicFallback
        ? `Deterministic ${AI_USE_CASE_KEYS[params.useCaseSlug]} fallback generated`
        : `AI ${AI_USE_CASE_KEYS[params.useCaseSlug]} generated`,
      summary:
        Array.isArray(aiOutput.limitations) && aiOutput.limitations.length > 0
          ? `${deterministicFallback ? 'Fallback' : 'AI output'} generated with limitations: ${aiOutput.limitations.join('; ')}`
          : deterministicFallback
            ? 'Deterministic factual fallback generated without an LLM'
            : 'AI output generated',
      correlationId,
    });

    const evidence = await this.evidenceService.createEvidence({
      tenantId: params.tenantId,
      environmentId: context.environmentId,
      region: context.region,
      evidenceType: deterministicFallback
        ? 'DETERMINISTIC_FALLBACK'
        : 'AI_OUTPUT',
      producingService: deterministicFallback ? 'shield-core' : 'shield-ai',
      sourceSystemId: deterministicFallback
        ? 'shield-core-no-llm-continuity'
        : 'shield-ai',
      sourceObjectId: aiOutput.id,
      purpose: 'INVESTIGATION',
      content: {
        aiOutputId: aiOutput.id,
        useCase: AI_USE_CASE_KEYS[params.useCaseSlug],
        citations: aiOutput.citations,
        limitations: aiOutput.limitations,
        deterministic: deterministicFallback,
        continuityEventId: aiOutput.continuityEventId,
        content: deterministicFallback ? aiOutput.content : undefined,
      },
    });

    return { aiOutput, evidenceId: evidence.id };
  }

  async review(params: {
    tenantId: string;
    environmentId: string;
    region: string;
    outputId: string;
    actorId: string;
    decision: string;
    rationale?: string;
    modifiedContent?: string;
  }) {
    const authorization = await this.authorizationDecisionService.evaluate({
      actorId: params.actorId,
      tenantId: params.tenantId,
      action: 'ai:review_output',
      resourceType: 'AI_OUTPUT',
      resourceId: params.outputId,
    });
    assertPermittedAuthorization(
      authorization,
      'Actor is not authorized to review AI output',
    );
    const { authorizationDecisionId } = authorization;

    const context: AiRequestContext = {
      tenantId: params.tenantId,
      environmentId: params.environmentId,
      region: params.region,
      dataClass: 'CASE_INVESTIGATION',
      purpose: 'AI_OUTPUT_REVIEW',
      actorId: params.actorId,
      authorizationDecisionId,
      correlationId: randomUUID(),
      traceId: randomUUID(),
      policyVersion: '1.0',
    };

    return this.shieldAiClient.reviewOutput(params.outputId, context, {
      decision: params.decision,
      rationale: params.rationale,
      modifiedContent: params.modifiedContent,
    });
  }
}
