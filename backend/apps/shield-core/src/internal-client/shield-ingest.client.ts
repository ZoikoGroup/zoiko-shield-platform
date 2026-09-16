import {
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
 * shield-core's internal client to shield-ingest.
 * Always carries signed workload identity tokens (audience 'shield-ingest')
 * and an explicit x-tenant-id header.
 */
@Injectable()
export class ShieldIngestClient {
  private readonly logger = new Logger(ShieldIngestClient.name);

  private headers(extraHeaders?: Record<string, string>): Record<string, string> {
    const traceId = (global as any).__currentTraceId || '0123456789abcdef0123456789abcdef';
    const spanId = '0123456789abcdef';
    return {
      'Content-Type': 'application/json',
      'traceparent': `00-${traceId}-${spanId}-01`,
      'x-correlation-id': traceId,
      ...workloadAuthorizationHeaders('shield-ingest'),
      ...(extraHeaders || {}),
    };
  }

  // --- Connector Catalog & Types ---
  async getConnectorTypes(): Promise<any> {
    return this.get('/api/v1/connector-types', { 'x-tenant-id': 'system-catalog' });
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
    return this.patch(`/api/v1/connectors/${id}`, dto, { 'x-tenant-id': tenantId });
  }

  async deleteConnector(tenantId: string, id: string): Promise<any> {
    return this.delete(`/api/v1/connectors/${id}`, { 'x-tenant-id': tenantId });
  }

  async testConnector(tenantId: string, id: string): Promise<any> {
    return this.post(`/api/v1/connectors/${id}/test`, {}, { 'x-tenant-id': tenantId });
  }

  async syncConnector(tenantId: string, id: string): Promise<any> {
    return this.post(`/api/v1/connectors/${id}/sync`, {}, { 'x-tenant-id': tenantId });
  }

  async getConnectorHealth(tenantId: string, id: string): Promise<any> {
    return this.get(`/api/v1/connectors/${id}/health`, { 'x-tenant-id': tenantId });
  }

  // --- Controls & Control Evaluations ---
  async listControlEvaluations(tenantId: string): Promise<any> {
    return this.get('/api/v1/control-evaluations', { 'x-tenant-id': tenantId });
  }

  async evaluateControl(tenantId: string, controlId: string, dto?: any): Promise<any> {
    return this.post(`/api/v1/control-tests/${controlId}/evaluate`, dto || {}, { 'x-tenant-id': tenantId });
  }

  // --- Events & Telemetry ---
  async listEvents(tenantId: string, query?: Record<string, string>): Promise<any> {
    const params = new URLSearchParams(query || {});
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return this.get(`/api/v1/events${queryString}`, { 'x-tenant-id': tenantId });
  }

  // --- HTTP Helpers ---
  private async get(path: string, extraHeaders?: Record<string, string>): Promise<any> {
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
      this.logger.warn(`shield-ingest GET returned ${response.status} for ${path}: ${text.slice(0, 300)}`);
      throw new ServiceUnavailableException(
        response.status === 403 ? 'POLICY_DENIED' : 'INGEST_UNAVAILABLE',
      );
    }

    return response.json();
  }

  private async post(path: string, body: unknown, extraHeaders?: Record<string, string>): Promise<any> {
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
      this.logger.warn(`shield-ingest POST returned ${response.status} for ${path}: ${text.slice(0, 300)}`);
      throw new ServiceUnavailableException(
        response.status === 403 ? 'POLICY_DENIED' : 'INGEST_UNAVAILABLE',
      );
    }

    return response.json();
  }

  private async patch(path: string, body: unknown, extraHeaders?: Record<string, string>): Promise<any> {
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
      this.logger.warn(`shield-ingest PATCH returned ${response.status} for ${path}: ${text.slice(0, 300)}`);
      throw new ServiceUnavailableException(
        response.status === 403 ? 'POLICY_DENIED' : 'INGEST_UNAVAILABLE',
      );
    }

    return response.json();
  }

  private async delete(path: string, extraHeaders?: Record<string, string>): Promise<any> {
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
      this.logger.warn(`shield-ingest DELETE returned ${response.status} for ${path}: ${text.slice(0, 300)}`);
      throw new ServiceUnavailableException(
        response.status === 403 ? 'POLICY_DENIED' : 'INGEST_UNAVAILABLE',
      );
    }

    return response.json();
  }
}
