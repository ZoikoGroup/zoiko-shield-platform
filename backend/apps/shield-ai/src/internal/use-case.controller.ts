import {
  Controller,
  Post,
  Param,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { InternalAuthGuard } from '../internal-client/internal-auth.guard';
import { GatewayRequestContext } from '../gateway/ai-gateway.service';
import { CaseSummaryService } from '../use-cases/case-summary/case-summary.service';
import { InvestigationHypothesisService } from '../use-cases/investigation-hypothesis/investigation-hypothesis.service';
import { EntityExplanationService } from '../use-cases/entity-explanation/entity-explanation.service';
import { NextQueryService } from '../use-cases/next-query/next-query.service';
import { ResponseRecommendationService } from '../use-cases/response-recommendation/response-recommendation.service';
import {
  DetectionCandidateInput,
  DetectionCandidateService,
} from '../use-cases/detection-candidate/detection-candidate.service';
import {
  DetectionExplanationInput,
  DetectionExplanationService,
} from '../use-cases/detection-explanation/detection-explanation.service';

export class InvokeUseCaseDto {
  context!: GatewayRequestContext;
  input!: Record<string, unknown>;
}

/**
 * shield-ai's only inbound surface — every route here is InternalAuthGuard
 * protected, reachable only from shield-core (spec correction #5). Never
 * directly customer/frontend-facing.
 */
@Controller('internal/v1/use-cases')
@UseGuards(InternalAuthGuard)
export class UseCaseController {
  constructor(
    private readonly caseSummary: CaseSummaryService,
    private readonly investigationHypothesis: InvestigationHypothesisService,
    private readonly entityExplanation: EntityExplanationService,
    private readonly nextQuery: NextQueryService,
    private readonly responseRecommendation: ResponseRecommendationService,
    private readonly detectionCandidate: DetectionCandidateService,
    private readonly detectionExplanation: DetectionExplanationService,
  ) {}

  @Post(':key/invoke')
  async invoke(@Param('key') key: string, @Body() dto: InvokeUseCaseDto) {
    const context: GatewayRequestContext = {
      ...dto.context,
      caseId: (dto.input?.caseId as string) ?? dto.context.caseId,
    };

    switch (key) {
      case 'CASE_SUMMARY':
        return { data: await this.caseSummary.invoke(context) };
      case 'INVESTIGATION_HYPOTHESIS':
        return { data: await this.investigationHypothesis.invoke(context) };
      case 'ENTITY_EXPLANATION':
        return { data: await this.entityExplanation.invoke(context) };
      case 'NEXT_QUERY_SUGGESTION':
        return { data: await this.nextQuery.invoke(context) };
      case 'RESPONSE_RECOMMENDATION':
        return { data: await this.responseRecommendation.invoke(context) };
      case 'DETECTION_CANDIDATE':
        return {
          data: await this.detectionCandidate.generateCandidate(
            (dto.input as unknown as DetectionCandidateInput) || {
              name: 'Candidate Rule',
              description: 'AI-generated candidate rule',
            },
            context,
          ),
        };
      case 'DETECTION_EXPLANATION':
        return {
          data: await this.detectionExplanation.explainMatch(
            (dto.input as unknown as DetectionExplanationInput) || {
              ruleId: 'rule-unknown',
              ruleVersion: 1,
              matchedEventIds: [],
            },
            context,
          ),
        };
      default:
        throw new BadRequestException(`Unknown use case key '${key}'`);
    }
  }
}
