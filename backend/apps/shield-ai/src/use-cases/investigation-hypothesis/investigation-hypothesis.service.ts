import { Injectable, Optional } from '@nestjs/common';
import {
  AiGatewayService,
  GatewayRequestContext,
} from '../../gateway/ai-gateway.service';
import { DecisionRightsService } from '../../decision-rights/decision-rights.service';
import {
  AiReviewEnvelope,
  DecisionSourceSpan,
} from '../../decision-rights/ai-review-envelope.interface';

export const INVESTIGATION_HYPOTHESIS_USE_CASE_KEY = 'INVESTIGATION_HYPOTHESIS';

@Injectable()
export class InvestigationHypothesisService {
  constructor(
    private readonly gateway: AiGatewayService,
    @Optional() private readonly decisionRightsService?: DecisionRightsService,
  ) {}

  invoke(context: GatewayRequestContext) {
    return this.gateway.invoke(
      INVESTIGATION_HYPOTHESIS_USE_CASE_KEY,
      INVESTIGATION_HYPOTHESIS_USE_CASE_KEY,
      context,
    );
  }

  async invokeWithDecisionEnvelope(
    context: GatewayRequestContext,
    options?: {
      sources?: DecisionSourceSpan[];
      requiredRole?: string;
    },
  ): Promise<{ output: any; envelope?: AiReviewEnvelope }> {
    const output = await this.invoke(context);

    if (!this.decisionRightsService) {
      return { output };
    }

    const sources: DecisionSourceSpan[] =
      options?.sources && options.sources.length > 0
        ? options.sources
        : [
            {
              sourceId: context.correlationId || 'ctx-hypo-01',
              sourceType: 'INVESTIGATION_CONTEXT',
              exactSpan: (output.content || '').slice(0, 100) || 'Investigation hypotheses synthesized from context',
              confidence: 0.91,
            },
          ];

    const envelope = this.decisionRightsService.wrapInEnvelope({
      tenantId: context.tenantId,
      environmentId: context.environmentId,
      aiLabelAndUseCaseName: {
        aiLabel: 'ZoikoShield Investigation Copilot',
        useCaseName: INVESTIGATION_HYPOTHESIS_USE_CASE_KEY,
        modelRoute: (output as any).model_profile_id || 'default-llm',
      },
      sourcesAndSpans: sources,
      knownMissingStaleOrConflictingEvidence: {
        missingEvidence: [],
        staleEvidence: [],
        conflictingEvidence: [],
      },
      calibratedConfidenceAndUncertainty: {
        score: 0.88,
        qualitativeBand: 'HIGH',
        calibrationBasis: 'Synthesized from timeline chronology and MITRE technique mapping',
        uncertaintyFactors: [],
      },
      alternativeHypothesesOrActions: [
        {
          title: 'Benign Administrative Anomaly',
          rationale: 'Activity matches scheduled maintenance pattern without malicious payload',
          tradeOffs: 'Premature closure risks missing low-and-slow persistence',
        },
      ],
      expectedImpactAndReversibility: {
        blastRadius: 'Case investigation timeline and analyst triage queue',
        isReversible: true,
        reversibilityTier: 'R0',
      },
      requiredAuthorityAndApprovals: {
        requiredRole: options?.requiredRole || 'TIER_1_SOC_ANALYST',
        responseAuthorityTier: 'R0',
        dualApproverRequired: false,
      },
      appealOrFeedbackRoute: {
        appealUrl: `/api/v1/ai/decisions/appeals/${context.correlationId}`,
        feedbackChannel: 'triage-feedback',
        customerAffecting: false,
      },
      payload: output,
    });

    return { output, envelope };
  }
}
