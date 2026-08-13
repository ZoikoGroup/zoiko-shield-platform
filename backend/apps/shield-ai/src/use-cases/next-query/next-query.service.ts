import { Injectable } from '@nestjs/common';
import {
  AiGatewayService,
  GatewayRequestContext,
} from '../../gateway/ai-gateway.service';

export const NEXT_QUERY_SUGGESTION_USE_CASE_KEY = 'NEXT_QUERY_SUGGESTION';

@Injectable()
export class NextQueryService {
  constructor(private readonly gateway: AiGatewayService) {}

  invoke(context: GatewayRequestContext) {
    return this.gateway.invoke(
      NEXT_QUERY_SUGGESTION_USE_CASE_KEY,
      NEXT_QUERY_SUGGESTION_USE_CASE_KEY,
      context,
    );
  }
}
