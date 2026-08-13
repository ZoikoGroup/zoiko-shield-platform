import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { workloadAuthorizationHeaders } from '../../../../libs/security/src/workload-token';

const SHIELD_AI_BASE_URL = process.env.SHIELD_AI_BASE_URL || 'http://localhost:3003';

export interface AiRequestContext {
  tenantId: string;
  environmentId: string;
  legalEntityId?: string;
  region: string;
  dataClass: string;
  purpose: string;
  actorId: string;
  caseId?: string;
  alertId?: string;
  authorizationDecisionId: string;
  correlationId: string;
  traceId: string;
  policyVersion: string;
}

/**
 * shield-core's only path to shield-ai — always an internal, guarded HTTP
 * call carrying a server-resolved AiRequestContext (spec §7); never a
 * frontend-supplied tenant, never a call shield-ai originates itself.
 */
@Injectable()
export class ShieldAiClient {
  private readonly logger = new Logger(ShieldAiClient.name);

  private headers(): Record<string, string> {
    return { 'Content-Type': 'application/json', ...workloadAuthorizationHeaders('shield-ai') };
  }

  async requestUseCase(useCaseKey: string, context: AiRequestContext, input: Record<string, unknown>): Promise<any> {
    return this.post(`/internal/v1/use-cases/${useCaseKey}/invoke`, { context, input });
  }

  async reviewOutput(outputId: string, context: AiRequestContext, review: { decision: string; rationale?: string; modifiedContent?: string }): Promise<any> {
    return this.post(`/internal/v1/ai/outputs/${outputId}/review`, { context, review });
  }

  private async post(path: string, body: unknown): Promise<any> {
    let response: Response;
    try {
      response = await fetch(`${SHIELD_AI_BASE_URL}${path}`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
      });
    } catch (err) {
      this.logger.error(`shield-ai unreachable: ${(err as Error).message}`);
      throw new ServiceUnavailableException('AI_UNAVAILABLE');
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.warn(`shield-ai returned ${response.status} for ${path}: ${text.slice(0, 300)}`);
      throw new ServiceUnavailableException(response.status === 403 ? 'POLICY_DENIED' : 'AI_UNAVAILABLE');
    }

    return response.json();
  }
}
