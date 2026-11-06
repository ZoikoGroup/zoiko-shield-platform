import {
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { workloadAuthorizationHeaders } from '../../../../libs/security/src/workload-token';

const SHIELD_INGEST_BASE_URL =
  process.env.SHIELD_INGEST_URL ||
  process.env.SHIELD_INGEST_BASE_URL ||
  'http://localhost:3002';

/**
 * Maps a shield-ingest error to what the caller should see. A 4xx is ingest's
 * decision about this request (validation, data residency, not found, policy)
 * and is passed on with its message; a 401 means the service-to-service
 * credentials were refused and a 5xx means ingest failed, so both are an
 * unavailable ingest service.
 */
export function ingestError(status: number, bodyText: string): HttpException {
  if (status >= 400 && status < 500 && status !== 401) {
    let message: unknown = bodyText;
    try {
      const parsed = JSON.parse(bodyText);
      message = parsed?.message ?? bodyText;
    } catch {
      // Not JSON: use the text as is.
    }
    return new HttpException(
      { statusCode: status, error: 'INGEST_REJECTED', message: message || `shield-ingest returned ${status}` },
      status,
    );
  }
  return new ServiceUnavailableException('INGEST_UNAVAILABLE');
}

/**
 * shield-core's internal client to shield-ingest.
 * Always carries signed workload identity tokens (audience 'shield-ingest')
 * and an explicit x-tenant-id header.
 */
@Injectable()
export class ShieldIngestClient {
  private readonly logger = new Logger(ShieldIngestClient.name);

  private headers(
    extraHeaders?: Record<string, string>,
  ): Record<string, string> {
    const traceId =
      (global as any).__currentTraceId || '0123456789abcdef0123456789abcdef';
    const spanId = '0123456789abcdef';
    return {
      'Content-Type': 'application/json',
      traceparent: `00-${traceId}-${spanId}-01`,
      'x-correlation-id': traceId,
      ...workloadAuthorizationHeaders('shield-ingest'),
      ...(extraHeaders || {}),
    };
  }

  // --- Connector Catalog & Types ---
  async getConnectorTypes(): Promise<any> {
    return this.get('/api/v1/connector-types', {
      'x-tenant-id': 'system-catalog',
    });
  }

  async listConnectors(tenantId: string): Promise<any> {
    return this.get('/api/v1/connectors', { 'x-tenant-id': tenantId });
  }

  async createConnector(tenantId: string, dto: any): Promise<any> {
    return this.post('/api/v1/connectors', dto, { 'x-tenant-id': tenantId });
  }

  async getConnector(tenantId: string, id: string): Promise<any> {
    return this.get(`/api/v1/connectors/${id}`, { 'x-tenant-id': tenantId });
  }

  async updateConnector(tenantId: string, id: string, dto: any): Promise<any> {
    return this.patch(`/api/v1/connectors/${id}`, dto, {
      'x-tenant-id': tenantId,
    });
  }

  async deleteConnector(tenantId: string, id: string): Promise<any> {
    return this.delete(`/api/v1/connectors/${id}`, { 'x-tenant-id': tenantId });
  }

  async testConnector(tenantId: string, id: string): Promise<any> {
    return this.post(
      `/api/v1/connectors/${id}/test`,
      {},
      { 'x-tenant-id': tenantId },
    );
  }

  async syncConnector(tenantId: string, id: string): Promise<any> {
    return this.post(
      `/api/v1/connectors/${id}/sync`,
      {},
      { 'x-tenant-id': tenantId },
    );
  }

  async getConnectorHealth(tenantId: string, id: string): Promise<any> {
    return this.get(`/api/v1/connectors/${id}/health`, {
      'x-tenant-id': tenantId,
    });
  }

  // --- Controls & Control Evaluations ---
  async listControlEvaluations(tenantId: string): Promise<any> {
    return this.get('/api/v1/control-evaluations', { 'x-tenant-id': tenantId });
  }

  async evaluateControl(
    tenantId: string,
    controlId: string,
    dto?: any,
  ): Promise<any> {
    return this.post(`/api/v1/control-tests/${controlId}/evaluate`, dto || {}, {
      'x-tenant-id': tenantId,
    });
  }

  // listControlObjectives/createControlObjective (ingest's tenant-scoped
  // control-testing objectives) are deliberately not wrapped here: the path
  // they'd need, api/v1/controls, is already core's own ControlsController
  // (a different, global control catalog). See connectors-proxy.controller.ts.

  // --- Assurance Reviews & vCISO Reflections ---
  async getAssurancePosture(tenantId: string): Promise<any> {
    return this.get('/api/v1/assurance/posture', { 'x-tenant-id': tenantId });
  }

  async listAssuranceReviews(tenantId: string): Promise<any> {
    return this.get('/api/v1/assurance/reviews', { 'x-tenant-id': tenantId });
  }

  async createAssuranceReview(tenantId: string, dto: any): Promise<any> {
    return this.post('/api/v1/assurance/reviews', dto, {
      'x-tenant-id': tenantId,
    });
  }

  async listAssuranceReflections(
    tenantId: string,
    assuranceReviewId?: string,
  ): Promise<any> {
    const queryString = assuranceReviewId
      ? `?assuranceReviewId=${assuranceReviewId}`
      : '';
    return this.get(`/api/v1/assurance/reflections${queryString}`, {
      'x-tenant-id': tenantId,
    });
  }

  async createAssuranceReflection(tenantId: string, dto: any): Promise<any> {
    return this.post('/api/v1/assurance/reflections', dto, {
      'x-tenant-id': tenantId,
    });
  }

  // --- SLA Claims & Performance ---
  async evaluateSlaClaim(tenantId: string, dto: any): Promise<any> {
    return this.post('/api/v1/sla/claims/evaluate', dto, {
      'x-tenant-id': tenantId,
    });
  }

  async listSlaClaimEvaluations(
    tenantId: string,
    claimKey?: string,
  ): Promise<any> {
    const queryString = claimKey ? `?claimKey=${claimKey}` : '';
    return this.get(`/api/v1/sla/claims/evaluations${queryString}`, {
      'x-tenant-id': tenantId,
    });
  }

  async getSlaPerformance(tenantId: string): Promise<any> {
    return this.get('/api/v1/sla/performance', { 'x-tenant-id': tenantId });
  }

  // --- Metering ---
  async getMeteringUsage(tenantId: string): Promise<any> {
    return this.get('/api/v1/metering/usage', { 'x-tenant-id': tenantId });
  }

  async getMeteringResources(tenantId: string): Promise<any> {
    return this.get('/api/v1/metering/resources', { 'x-tenant-id': tenantId });
  }

  // --- Events & Telemetry ---
  async listEvents(
    tenantId: string,
    query?: Record<string, string>,
  ): Promise<any> {
    const params = new URLSearchParams(query || {});
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return this.get(`/api/v1/events${queryString}`, {
      'x-tenant-id': tenantId,
    });
  }

  async getEventById(tenantId: string, eventId: string): Promise<any> {
    return this.get(`/api/v1/events/${eventId}`, {
      'x-tenant-id': tenantId,
    });
  }

  // --- Dead Letter Queue & Quarantine ---
  async getDlqMetrics(tenantId: string): Promise<any> {
    return this.get('/api/v1/dlq/metrics', { 'x-tenant-id': tenantId });
  }

  async listQuarantinedEvents(
    tenantId: string,
    query?: Record<string, string>,
  ): Promise<any> {
    const params = new URLSearchParams(query || {});
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return this.get(`/api/v1/quarantine${queryString}`, {
      'x-tenant-id': tenantId,
    });
  }

  async reprocessQuarantinedEvent(
    tenantId: string,
    quarantineId: string,
  ): Promise<any> {
    return this.post(
      `/api/v1/quarantine/${quarantineId}/reprocess`,
      {},
      { 'x-tenant-id': tenantId },
    );
  }

  async triggerDlqAutoRetry(tenantId: string, limit?: number): Promise<any> {
    const queryString = limit ? `?limit=${limit}` : '';
    return this.post(
      `/api/v1/dlq/auto-retry${queryString}`,
      {},
      { 'x-tenant-id': tenantId },
    );
  }

  // --- HTTP Helpers ---
  private async get(
    path: string,
    extraHeaders?: Record<string, string>,
  ): Promise<any> {
    let response: Response;
    try {
      response = await fetch(`${SHIELD_INGEST_BASE_URL}${path}`, {
        method: 'GET',
        headers: this.headers(extraHeaders),
      });
    } catch (err) {
      this.logger.error(`shield-ingest unreachable: ${(err as Error).message}`);
      throw new ServiceUnavailableException('INGEST_UNAVAILABLE');
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.warn(
        `shield-ingest GET returned ${response.status} for ${path}: ${text.slice(0, 300)}`,
      );
      throw ingestError(response.status, text);
    }

    return response.json();
  }

  private async post(
    path: string,
    body: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<any> {
    let response: Response;
    try {
      response = await fetch(`${SHIELD_INGEST_BASE_URL}${path}`, {
        method: 'POST',
        headers: this.headers(extraHeaders),
        body: JSON.stringify(body),
      });
    } catch (err) {
      this.logger.error(`shield-ingest unreachable: ${(err as Error).message}`);
      throw new ServiceUnavailableException('INGEST_UNAVAILABLE');
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.warn(
        `shield-ingest POST returned ${response.status} for ${path}: ${text.slice(0, 300)}`,
      );
      throw ingestError(response.status, text);
    }

    return response.json();
  }

  private async patch(
    path: string,
    body: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<any> {
    let response: Response;
    try {
      response = await fetch(`${SHIELD_INGEST_BASE_URL}${path}`, {
        method: 'PATCH',
        headers: this.headers(extraHeaders),
        body: JSON.stringify(body),
      });
    } catch (err) {
      this.logger.error(`shield-ingest unreachable: ${(err as Error).message}`);
      throw new ServiceUnavailableException('INGEST_UNAVAILABLE');
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.warn(
        `shield-ingest PATCH returned ${response.status} for ${path}: ${text.slice(0, 300)}`,
      );
      throw ingestError(response.status, text);
    }

    return response.json();
  }

  private async delete(
    path: string,
    extraHeaders?: Record<string, string>,
  ): Promise<any> {
    let response: Response;
    try {
      response = await fetch(`${SHIELD_INGEST_BASE_URL}${path}`, {
        method: 'DELETE',
        headers: this.headers(extraHeaders),
      });
    } catch (err) {
      this.logger.error(`shield-ingest unreachable: ${(err as Error).message}`);
      throw new ServiceUnavailableException('INGEST_UNAVAILABLE');
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.warn(
        `shield-ingest DELETE returned ${response.status} for ${path}: ${text.slice(0, 300)}`,
      );
      throw ingestError(response.status, text);
    }

    return response.json();
  }
}
