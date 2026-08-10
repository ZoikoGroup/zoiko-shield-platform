import { Injectable } from '@nestjs/common';
import { AiGatewayService, GatewayRequestContext } from '../../gateway/ai-gateway.service';

export const CASE_SUMMARY_USE_CASE_KEY = 'CASE_SUMMARY';

@Injectable()
export class CaseSummaryService {
  constructor(private readonly gateway: AiGatewayService) {}

  invoke(context: GatewayRequestContext) {
    return this.gateway.invoke(CASE_SUMMARY_USE_CASE_KEY, CASE_SUMMARY_USE_CASE_KEY, context);
  }
}
