import { Injectable } from '@nestjs/common';
import {
  AiGatewayService,
  GatewayRequestContext,
} from '../../gateway/ai-gateway.service';

export const INVESTIGATION_HYPOTHESIS_USE_CASE_KEY = 'INVESTIGATION_HYPOTHESIS';

@Injectable()
export class InvestigationHypothesisService {
  constructor(private readonly gateway: AiGatewayService) {}

  invoke(context: GatewayRequestContext) {
    return this.gateway.invoke(
      INVESTIGATION_HYPOTHESIS_USE_CASE_KEY,
      INVESTIGATION_HYPOTHESIS_USE_CASE_KEY,
      context,
    );
  }
}
