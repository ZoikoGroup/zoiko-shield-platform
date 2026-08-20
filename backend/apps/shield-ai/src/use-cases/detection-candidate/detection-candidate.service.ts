import { Injectable } from '@nestjs/common';
import {
  AiGatewayService,
  GatewayRequestContext,
} from '../../gateway/ai-gateway.service';

export const DETECTION_CANDIDATE_USE_CASE_KEY = 'DETECTION_CANDIDATE';

export interface DetectionCandidateInput {
  name: string;
  description: string;
  category?: string;
  targetEventTypes?: string[];
  mitreTechnique?: string;
  symptoms?: string;
  sampleLogPayload?: Record<string, unknown>;
}

export interface DetectionCandidateOutput {
  key: string;
  name: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  ruleType: 'POINT' | 'THRESHOLD' | 'SEQUENCE';
  category: string;
  mitreTechnique?: string;
  conditionDefinition: Record<string, unknown>;
  requiredEventTypes: string[];
  requiredFields: string[];
  allowedMissingDataBehavior: 'IGNORE' | 'FAIL_OPEN' | 'INDETERMINATE';
  syntheticTestEvents: Array<{
    description: string;
    shouldMatch: boolean;
    eventPayload: Record<string, unknown>;
  }>;
  status: 'DRAFT';
  reviewState: 'AI_PROPOSED';
  limitations: string[];
}

/**
 * ZS-ENG-AI-001 §17: AI Use in Detection.
 * Permitted: Generate candidate rules, explain logic, suggest tests, cluster signals in sandbox.
 * Prohibited: Direct production rule publication without human review. Always returns DRAFT / AI_PROPOSED.
 */
@Injectable()
export class DetectionCandidateService {
  constructor(private readonly gateway: AiGatewayService) {}

  async generateCandidate(
    input: DetectionCandidateInput,
    context: GatewayRequestContext,
  ) {
    const gatewayContext: GatewayRequestContext = {
      ...context,
      purpose: `Generate candidate detection rule for '${input.name}' targeting ${input.targetEventTypes?.join(', ') || 'telemetry'} (MITRE: ${input.mitreTechnique || 'N/A'})`,
    };

    return this.gateway.invoke(
      DETECTION_CANDIDATE_USE_CASE_KEY,
      DETECTION_CANDIDATE_USE_CASE_KEY,
      gatewayContext,
    );
  }
}
