import { Injectable } from '@nestjs/common';
import {
  ModelProvider,
  ModelInvocationInput,
  ModelInvocationResult,
} from './model-provider.interface';

/**
 * Deterministic, no-network provider — the only provider wired this pass
 * (per explicit product decision: build the real routing/policy/fallback
 * machinery now, add a real Claude/OpenAI adapter later without touching
 * anything else). Never fabricates a source it wasn't given — cites only
 * refs actually present in the retrieval context it received.
 */
@Injectable()
export class MockModelProvider implements ModelProvider {
  readonly providerKey = 'mock';

  async invoke(input: ModelInvocationInput): Promise<ModelInvocationResult> {
    let sourceRefs: string[] = [];
    try {
      const parsed = JSON.parse(input.retrievalContext);
      sourceRefs = Array.isArray(parsed.sourceRefs) ? parsed.sourceRefs : [];
    } catch {
      sourceRefs = [];
    }

    const citedSourceRefs = sourceRefs.slice(
      0,
      Math.max(1, Math.min(3, sourceRefs.length)),
    );
    let content: string;
    if (
      input.userInput.includes('candidate detection rule') ||
      input.systemPrompt?.includes('DETECTION_CANDIDATE')
    ) {
      content = JSON.stringify({
        key: 'rule-ai-candidate-01',
        name: 'AI Generated Suspicious Activity Detection',
        description:
          'Auto-generated candidate detection rule based on observed symptoms',
        severity: 'HIGH',
        ruleType: 'THRESHOLD',
        status: 'DRAFT',
        reviewState: 'AI_PROPOSED',
        conditionDefinition: {
          field: 'eventActivity',
          operator: 'EQUALS',
          value: 'LOGIN_ATTEMPT',
          threshold: 5,
          windowSeconds: 60,
        },
        requiredEventTypes: ['user.login', 'auth.attempt'],
        requiredFields: ['actorEmail', 'sourceIp'],
        allowedMissingDataBehavior: 'INDETERMINATE',
        syntheticTestEvents: [
          {
            description: '5 failed login attempts from single IP within 30s',
            shouldMatch: true,
            eventPayload: {
              eventActivity: 'LOGIN_ATTEMPT',
              outcome: 'FAILED',
              sourceIp: '198.51.100.99',
            },
          },
        ],
        limitations: ['Synthetic baseline test required prior to publication'],
      });
    } else if (
      input.userInput.includes('Explain detection match') ||
      input.systemPrompt?.includes('DETECTION_EXPLANATION')
    ) {
      content = JSON.stringify({
        ruleSummary: `Detection match explanation across ${sourceRefs.length} cited source(s)`,
        truePositiveIndicators: [
          'Non-standard user-agent',
          'Multiple source IPs targeting single account',
        ],
        recommendedTuning:
          'Consider adding geographic subnet whitelist to reduce false positives',
        reviewState: 'AI_PROPOSED',
      });
    } else {
      content =
        sourceRefs.length > 0
          ? `Deterministic mock summary based on ${sourceRefs.length} retrieved source(s). This is not a real model output — no live provider is configured this milestone.`
          : `No retrievable sources were available for this request. Output is limited to acknowledging the absence of source material.`;
    }

    return {
      content,
      citedSourceRefs,
      confidence: sourceRefs.length > 0 ? 0.85 : 0.1,
    };
  }
}
