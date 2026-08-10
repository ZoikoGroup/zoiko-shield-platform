import { Injectable } from '@nestjs/common';
import { ModelProvider, ModelInvocationInput, ModelInvocationResult } from './model-provider.interface';

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

    const citedSourceRefs = sourceRefs.slice(0, Math.max(1, Math.min(3, sourceRefs.length)));
    const content =
      sourceRefs.length > 0
        ? `Deterministic mock summary based on ${sourceRefs.length} retrieved source(s). This is not a real model output — no live provider is configured this milestone.`
        : `No retrievable sources were available for this request. Output is limited to acknowledging the absence of source material.`;

    return {
      content,
      citedSourceRefs,
      confidence: sourceRefs.length > 0 ? 0.5 : 0.1,
    };
  }
}
