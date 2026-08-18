import { Injectable } from '@nestjs/common';
import {
  AiGatewayService,
  GatewayRequestContext,
} from '../../gateway/ai-gateway.service';

export const ENTITY_EXPLANATION_USE_CASE_KEY = 'ENTITY_EXPLANATION';

@Injectable()
export class EntityExplanationService {
  constructor(private readonly gateway: AiGatewayService) {}

  invoke(context: GatewayRequestContext) {
    return this.gateway.invoke(
      ENTITY_EXPLANATION_USE_CASE_KEY,
      ENTITY_EXPLANATION_USE_CASE_KEY,
      context,
    );
  }
}
