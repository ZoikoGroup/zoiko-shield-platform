import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { workloadAuthorizationHeaders } from '../../../../libs/security/src/workload-token';

const SHIELD_AI_BASE_URL =
  process.env.SHIELD_AI_BASE_URL || 'http://localhost:3003';

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

  private headers(extraHeaders?: Record<string, string>): Record<string, string> {
    const traceId = (global as any).__currentTraceId || '0123456789abcdef0123456789abcdef';
    const spanId = '0123456789abcdef';
    return {
      'Content-Type': 'application/json',
      'traceparent': `00-${traceId}-${spanId}-01`,
      'x-correlation-id': traceId,
      ...workloadAuthorizationHeaders('shield-ai'),
      ...(extraHeaders || {}),
    };
  }

  async requestUseCase(
    useCaseKey: string,
    context: AiRequestContext,
    input: Record<string, unknown>,
  ): Promise<any> {
    return this.post(`/internal/v1/use-cases/${useCaseKey}/invoke`, {
      context,
      input,
    });
  }

  async reviewOutput(
    outputId: string,
    context: AiRequestContext,
    review: { decision: string; rationale?: string; modifiedContent?: string },
  ): Promise<any> {
    return this.post(`/internal/v1/ai/outputs/${outputId}/review`, {
      context,
      review,
    });
  }

  // --- AI Incident Console Methods ---
  async declareIncident(tenantId: string, actorId: string, dto: any): Promise<any> {
    return this.post(
      `/api/v1/ai/incidents`,
      dto,
      { 'x-tenant-id': tenantId, 'x-actor-id': actorId },
    );
  }

  async listIncidents(tenantId: string, filters?: { status?: string; severity?: string; category?: string }): Promise<any> {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.severity) params.set('severity', filters.severity);
    if (filters?.category) params.set('category', filters.category);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.get(`/api/v1/ai/incidents${query}`, { 'x-tenant-id': tenantId });
  }

  async getIncident(tenantId: string, incidentId: string): Promise<any> {
    return this.get(`/api/v1/ai/incidents/${incidentId}`, { 'x-tenant-id': tenantId });
  }

  async getIncidentMetrics(tenantId: string): Promise<any> {
    return this.get(`/api/v1/ai/incidents/metrics`, { 'x-tenant-id': tenantId });
  }

  async containIncident(tenantId: string, incidentId: string, dto: any): Promise<any> {
    return this.post(`/api/v1/ai/incidents/${incidentId}/contain`, dto, { 'x-tenant-id': tenantId });
  }

  async fallbackIncident(tenantId: string, incidentId: string, dto: any): Promise<any> {
    return this.post(`/api/v1/ai/incidents/${incidentId}/fallback`, dto, { 'x-tenant-id': tenantId });
  }

  async rcaIncident(tenantId: string, incidentId: string, dto: any): Promise<any> {
    return this.post(`/api/v1/ai/incidents/${incidentId}/rca`, dto, { 'x-tenant-id': tenantId });
  }

  async resolveIncident(tenantId: string, incidentId: string, dto: any): Promise<any> {
    return this.post(`/api/v1/ai/incidents/${incidentId}/resolve`, dto, { 'x-tenant-id': tenantId });
  }

  async closeIncident(tenantId: string, incidentId: string, dto: any): Promise<any> {
    return this.post(`/api/v1/ai/incidents/${incidentId}/close`, dto, { 'x-tenant-id': tenantId });
  }

  // --- AI Decision Rights Methods ---
  async listDecisions(tenantId: string, filters?: { state?: string; useCase?: string }): Promise<any> {
    const params = new URLSearchParams();
    if (filters?.state) params.set('state', filters.state);
    if (filters?.useCase) params.set('useCase', filters.useCase);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.get(`/api/v1/ai/decisions${query}`, { 'x-tenant-id': tenantId });
  }

  async getDecision(tenantId: string, envelopeId: string): Promise<any> {
    return this.get(`/api/v1/ai/decisions/${envelopeId}`, { 'x-tenant-id': tenantId });
  }

  async acceptDecision(tenantId: string, envelopeId: string, dto: any): Promise<any> {
    return this.post(`/api/v1/ai/decisions/${envelopeId}/accept`, dto, { 'x-tenant-id': tenantId });
  }

  async modifyDecision(tenantId: string, envelopeId: string, dto: any): Promise<any> {
    return this.post(`/api/v1/ai/decisions/${envelopeId}/modify`, dto, { 'x-tenant-id': tenantId });
  }

  async rejectDecision(tenantId: string, envelopeId: string, dto: any): Promise<any> {
    return this.post(`/api/v1/ai/decisions/${envelopeId}/reject`, dto, { 'x-tenant-id': tenantId });
  }

  async escalateDecision(tenantId: string, envelopeId: string, dto: any): Promise<any> {
    return this.post(`/api/v1/ai/decisions/${envelopeId}/escalate`, dto, { 'x-tenant-id': tenantId });
  }

  // --- AI Governance & Supply Chain Views ---
  async getInventory(): Promise<any> {
    return this.get(`/api/v1/ai/inventory`);
  }

  async registerAiModel(profile: any): Promise<any> {
    return this.post(`/api/v1/ai/inventory`, profile);
  }

  async getAiModel(modelId: string): Promise<any> {
    return this.get(`/api/v1/ai/inventory/${encodeURIComponent(modelId)}`);
  }

  async updateAiModel(modelId: string, updates: any): Promise<any> {
    return this.patch(`/api/v1/ai/inventory/${encodeURIComponent(modelId)}`, updates);
  }

  async deleteAiModel(modelId: string): Promise<any> {
    return this.delete(`/api/v1/ai/inventory/${encodeURIComponent(modelId)}`);
  }

  async getSupplyChain(): Promise<any> {
    return this.get(`/api/v1/ai/supply-chain`);
  }

  async getFinOpsBudget(tenantId?: string): Promise<any> {
    const query = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
    return this.get(`/api/v1/ai/finops/budget${query}`);
  }

  async getDrift(modelId?: string, minSampleSize?: number): Promise<any> {
    const params = new URLSearchParams();
    if (modelId) params.set('modelId', modelId);
    if (minSampleSize) params.set('minSampleSize', String(minSampleSize));
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.get(`/api/v1/ai/drift${query}`);
  }

  async enforceDrift(modelId: string, tenantId: string, minSampleSize?: number): Promise<any> {
    return this.post(`/api/v1/ai/drift/evaluate`, {
      modelId,
      tenantId,
      minSampleSize: minSampleSize || 10,
    });
  }

  // --- AI Red-Team, Threat Hunting & RCA Methods ---
  async simulateRedTeamScenario(dto: any): Promise<any> {
    return this.post('/api/v1/ai/red-team/simulate-scenario', dto);
  }

  async executeRedTeamChain(dto: any): Promise<any> {
    return this.post('/api/v1/ai/red-team/execute-chain', dto);
  }

  async copilotHunt(dto: any): Promise<any> {
    return this.post('/api/v1/ai/copilot/hunt', dto);
  }

  async threatHuntingHunt(dto: any): Promise<any> {
    return this.post('/api/v1/ai/threat-hunting/hunt', dto);
  }

  async generateIncidentRca(dto: any): Promise<any> {
    return this.post('/api/v1/ai/rca/generate', dto);
  }

  private async get(path: string, extraHeaders?: Record<string, string>): Promise<any> {
    let response: Response;
    try {
      response = await fetch(`${SHIELD_AI_BASE_URL}${path}`, {
        method: 'GET',
        headers: this.headers(extraHeaders),
      });
    } catch (err) {
      this.logger.error(`shield-ai unreachable: ${(err as Error).message}`);
      throw new ServiceUnavailableException('AI_UNAVAILABLE');
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.warn(`shield-ai GET returned ${response.status} for ${path}: ${text.slice(0, 300)}`);
      throw new ServiceUnavailableException(
        response.status === 403 ? 'POLICY_DENIED' : 'AI_UNAVAILABLE',
      );
    }

    return response.json();
  }

  private async post(path: string, body: unknown, extraHeaders?: Record<string, string>): Promise<any> {
    let response: Response;
    try {
      response = await fetch(`${SHIELD_AI_BASE_URL}${path}`, {
        method: 'POST',
        headers: this.headers(extraHeaders),
        body: JSON.stringify(body),
      });
    } catch (err) {
      this.logger.error(`shield-ai unreachable: ${(err as Error).message}`);
      throw new ServiceUnavailableException('AI_UNAVAILABLE');
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.warn(
        `shield-ai POST returned ${response.status} for ${path}: ${text.slice(0, 300)}`,
      );
      throw new ServiceUnavailableException(
        response.status === 403 ? 'POLICY_DENIED' : 'AI_UNAVAILABLE',
      );
    }

    return response.json();
  }

  private async patch(path: string, body: unknown, extraHeaders?: Record<string, string>): Promise<any> {
    let response: Response;
    try {
      response = await fetch(`${SHIELD_AI_BASE_URL}${path}`, {
        method: 'PATCH',
        headers: this.headers(extraHeaders),
        body: JSON.stringify(body),
      });
    } catch (err) {
      this.logger.error(`shield-ai unreachable: ${(err as Error).message}`);
      throw new ServiceUnavailableException('AI_UNAVAILABLE');
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.warn(
        `shield-ai PATCH returned ${response.status} for ${path}: ${text.slice(0, 300)}`,
      );
      throw new ServiceUnavailableException(
        response.status === 403 ? 'POLICY_DENIED' : 'AI_UNAVAILABLE',
      );
    }

    return response.json();
  }

  private async delete(path: string, extraHeaders?: Record<string, string>): Promise<any> {
    let response: Response;
    try {
      response = await fetch(`${SHIELD_AI_BASE_URL}${path}`, {
        method: 'DELETE',
        headers: this.headers(extraHeaders),
      });
    } catch (err) {
      this.logger.error(`shield-ai unreachable: ${(err as Error).message}`);
      throw new ServiceUnavailableException('AI_UNAVAILABLE');
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.warn(
        `shield-ai DELETE returned ${response.status} for ${path}: ${text.slice(0, 300)}`,
      );
      throw new ServiceUnavailableException(
        response.status === 403 ? 'POLICY_DENIED' : 'AI_UNAVAILABLE',
      );
    }

    return response.json();
  }
}
