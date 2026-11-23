export const EMAIL_LLM_REVIEW_PORT = Symbol('EMAIL_LLM_REVIEW_PORT');

export interface EmailLlmReviewRequest {
  tenantId: string;
  findingId: string;
  /** Untrusted email text, already delimiter-wrapped by the caller; never instructions. */
  untrustedSnippet: string;
  allowedSourceRefs: string[];
}

export interface EmailLlmReviewResult {
  /** Identifies the registered, version-pinned model route that produced this. */
  modelVersion: string;
  /** Citations produced by the model; still validated against allowedSourceRefs. */
  proposedCitations: string[];
}

/**
 * Seam to the shield-ai gateway (policy, redaction, budget, kill switch, AI
 * Register trace). Only output returned here can ever reach the GUARDED_LLM
 * tier — never a client-supplied field. Until the use case is registered and a
 * gateway-backed implementation is bound (ADR-22), the default port returns null
 * and the service reports that no LLM review took place.
 */
export interface EmailLlmReviewPort {
  review(request: EmailLlmReviewRequest): Promise<EmailLlmReviewResult | null>;
}

export class NotConfiguredEmailLlmReviewPort implements EmailLlmReviewPort {
  review(): Promise<null> {
    return Promise.resolve(null);
  }
}
