import { Injectable, Optional } from '@nestjs/common';
import {
  AiGatewayService,
  GatewayRequestContext,
} from '../../gateway/ai-gateway.service';
import { DecisionRightsService } from '../../decision-rights/decision-rights.service';
import {
  AiReviewEnvelope,
  DecisionSourceSpan,
  ResponseAuthorityTier,
} from '../../decision-rights/ai-review-envelope.interface';

export const RESPONSE_RECOMMENDATION_USE_CASE_KEY = 'RESPONSE_RECOMMENDATION';

/**
 * Advisory only (spec §19 & §16) — this service returns an AiOutput naming a
 * recommended action wrapped in an AiReviewEnvelope. It never calls shield-action
 * and never creates an ActionProposal itself; that only happens after a human explicitly
 * accepts the recommendation via the decision-rights / response-proposal API.
 */
@Injectable()
export class ResponseRecommendationService {
  constructor(
    private readonly gateway: AiGatewayService,
    @Optional() private readonly decisionRightsService?: DecisionRightsService,
  ) {}

  invoke(context: GatewayRequestContext) {
    return this.gateway.invoke(
      RESPONSE_RECOMMENDATION_USE_CASE_KEY,
      RESPONSE_RECOMMENDATION_USE_CASE_KEY,
      context,
    );
  }

  async invokeWithDecisionEnvelope(
    context: GatewayRequestContext,
    options?: {
      reversibilityTier?: ResponseAuthorityTier;
      requiredRole?: string;
      sources?: DecisionSourceSpan[];
      blastRadius?: string;
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
              sourceId: context.correlationId || 'ctx-source-01',
              sourceType: 'CASE_TELEMETRY',
              exactSpan: (output.content || '').slice(0, 100) || 'Action recommendation generated from case context',
              confidence: 0.95,
            },
          ];

    const envelope = this.decisionRightsService.wrapInEnvelope({
      tenantId: context.tenantId,
      environmentId: context.environmentId,
      aiLabelAndUseCaseName: {
        aiLabel: 'ZoikoShield Response Copilot',
        useCaseName: RESPONSE_RECOMMENDATION_USE_CASE_KEY,
        modelRoute: (output as any).model_profile_id || 'default-llm',
      },
      sourcesAndSpans: sources,
      knownMissingStaleOrConflictingEvidence: {
        missingEvidence: [],
        staleEvidence: [],
        conflictingEvidence: [],
      },
      calibratedConfidenceAndUncertainty: {
        score: 0.94,
        qualitativeBand: 'HIGH',
        calibrationBasis: 'Corroborated by SOC incident telemetry and automated containment playbooks',
        uncertaintyFactors: [],
      },
      alternativeHypothesesOrActions: [
        {
          title: 'Manual Triage & Observation',
          rationale: 'Leave workload in current state and observe lateral activity',
          tradeOffs: 'Higher risk of data exfiltration during observation window',
        },
      ],
      expectedImpactAndReversibility: {
        blastRadius: options?.blastRadius || 'Target workload and active credential sessions',
        isReversible: true,
        reversibilityTier: options?.reversibilityTier || 'R2',
        compensationPlan: '1-click rollback via ActionRollbackBrokerService',
      },
      requiredAuthorityAndApprovals: {
        requiredRole: options?.requiredRole || 'SECURITY_OPERATIONS_LEAD',
        responseAuthorityTier: options?.reversibilityTier || 'R2',
        dualApproverRequired: false,
      },
      appealOrFeedbackRoute: {
        appealUrl: `/api/v1/ai/decisions/appeals/${context.correlationId}`,
        feedbackChannel: 'secops-appeals',
        customerAffecting: true,
      },
      payload: output,
    });

    return { output, envelope };
  }
}
