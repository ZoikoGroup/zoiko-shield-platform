import { Injectable, Logger } from '@nestjs/common';
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
  ) {}

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

    const result = await this.shieldAiClient.requestUseCase(
      AI_USE_CASE_KEYS[params.useCaseSlug],
      context,
      { caseId: params.caseId },
    );
    const aiOutput = result.data;

    await this.timeline.append({
      tenantId: params.tenantId,
      caseId: params.caseId,
      entryType: 'DECISION_RECORDED',
      actorId: params.actorId,
      title: `AI ${AI_USE_CASE_KEYS[params.useCaseSlug]} generated`,
      summary:
        Array.isArray(aiOutput.limitations) && aiOutput.limitations.length > 0
          ? `AI output generated with limitations: ${aiOutput.limitations.join('; ')}`
          : 'AI output generated',
      correlationId,
    });

    const evidence = await this.evidenceService.createEvidence({
      tenantId: params.tenantId,
      environmentId: context.environmentId,
      region: context.region,
      evidenceType: 'AI_OUTPUT',
      producingService: 'shield-ai',
      sourceSystemId: 'shield-ai',
      sourceObjectId: aiOutput.id,
      purpose: 'INVESTIGATION',
      content: {
        aiOutputId: aiOutput.id,
        useCase: AI_USE_CASE_KEYS[params.useCaseSlug],
        citations: aiOutput.citations,
        limitations: aiOutput.limitations,
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
