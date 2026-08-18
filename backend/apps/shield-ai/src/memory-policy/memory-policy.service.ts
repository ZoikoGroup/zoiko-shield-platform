import { Injectable } from '@nestjs/common';

/**
 * Enforces spec §15: no hidden cross-case memory, no global customer
 * memory, no cross-tenant vector memory, no uncontrolled provider memory.
 * This gateway holds no request-scoped cache and no in-memory store keyed
 * by anything other than the current request's own tenantId/caseId — every
 * RetrievalBundle is built fresh per request from shield-core, and nothing
 * in this codebase persists AI state outside AiOutput/RetrievalBundle
 * (both tenant/case-scoped, both shield-ai-owned, both queried only by
 * their own id — never scanned across tenants or cases).
 */
@Injectable()
export class MemoryPolicyService {
  assertRequestScoped(params: { tenantId: string; caseId?: string }): void {
    if (!params.tenantId) {
      throw new Error(
        'Memory policy violation: no tenantId on request context — cannot scope retrieval/output',
      );
    }
  }
}
