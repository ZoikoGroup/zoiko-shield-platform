export interface ModelInvocationInput {
  systemPrompt: string;
  userInput: string;
  retrievalContext: string;
  outputSchema: Record<string, unknown>;
  maxOutputTokens?: number;
}

export interface ModelInvocationResult {
  content: string;
  /** Raw citation refs the model claimed to use — validated by evaluation/ against the actual RetrievalBundle before being trusted. */
  citedSourceRefs: string[];
  confidence?: number;
}

/**
 * Every real provider adapter (Claude, OpenAI, ...) implements this.
 * Deliberately provider-agnostic: the gateway/policy pipeline runs
 * identically in front of MockModelProvider and any future real adapter,
 * so swapping providers later never changes authorization behavior.
 */
export interface ModelProvider {
  readonly providerKey: string;
  invoke(input: ModelInvocationInput): Promise<ModelInvocationResult>;
}
