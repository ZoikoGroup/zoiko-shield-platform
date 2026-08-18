import { Injectable } from '@nestjs/common';
import {
  AiGatewayService,
  GatewayRequestContext,
} from '../../gateway/ai-gateway.service';

export const RESPONSE_RECOMMENDATION_USE_CASE_KEY = 'RESPONSE_RECOMMENDATION';

/**
 * Advisory only (spec §19) — this service returns an AiOutput naming a
 * recommended action. It never calls shield-action and never creates an
 * ActionProposal itself; that only happens after a human explicitly
 * accepts the recommendation via shield-core's response-proposal API.
 */
@Injectable()
export class ResponseRecommendationService {
  constructor(private readonly gateway: AiGatewayService) {}

  invoke(context: GatewayRequestContext) {
    return this.gateway.invoke(
      RESPONSE_RECOMMENDATION_USE_CASE_KEY,
      RESPONSE_RECOMMENDATION_USE_CASE_KEY,
      context,
    );
  }
}
