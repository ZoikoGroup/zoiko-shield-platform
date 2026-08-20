import { Injectable } from '@nestjs/common';
import {
  AiGatewayService,
  GatewayRequestContext,
} from '../../gateway/ai-gateway.service';

export const DETECTION_EXPLANATION_USE_CASE_KEY = 'DETECTION_EXPLANATION';

export interface DetectionExplanationInput {
  ruleId: string;
  ruleVersion: number;
  alertId?: string;
  matchedEventIds: string[];
  evaluationDetails?: Record<string, unknown>;
}

/**
 * ZS-ENG-AI-001 §17 & §18: AI Detection Explanation & Grounding.
 * Explains match logic, assesses true/false positive indicators, and suggests suppression / tuning
 * with machine-validated evidence citations.
 */
@Injectable()
export class DetectionExplanationService {
  constructor(private readonly gateway: AiGatewayService) {}

  async explainMatch(
    input: DetectionExplanationInput,
    context: GatewayRequestContext,
  ) {
    const gatewayContext: GatewayRequestContext = {
      ...context,
      purpose: `Explain detection match for rule '${input.ruleId}' (v${input.ruleVersion}) across ${input.matchedEventIds.length} matched event(s)`,
    };

    return this.gateway.invoke(
      DETECTION_EXPLANATION_USE_CASE_KEY,
      DETECTION_EXPLANATION_USE_CASE_KEY,
      gatewayContext,
    );
  }
}
