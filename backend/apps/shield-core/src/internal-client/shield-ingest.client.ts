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
const SHIELD_INGEST_TIMEOUT_MS = Number(
  process.env.SHIELD_INGEST_TIMEOUT_MS || 10000,
);

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
      {
        statusCode: status,
        error: 'INGEST_REJECTED',
        message: message || `shield-ingest returned ${status}`,
      },
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

  async getConnectorActivity(
    tenantId: string,
    id: string,
    limit?: number,
  ): Promise<any> {
    const query = limit ? `?limit=${limit}` : '';
    return this.get(`/api/v1/connectors/${id}/activity${query}`, {
      'x-tenant-id': tenantId,
    });
  }

  async getConnectorHealth(tenantId: string, id: string): Promise<any> {
    return this.get(`/api/v1/connectors/${id}/health`, {
      'x-tenant-id': tenantId,
    });
  }

  async activateConnector(
    tenantId: string,
    id: string,
    idempotencyKey?: string,
  ): Promise<any> {
    return this.post(
      `/api/v1/connectors/${id}/activate`,
      {},
      {
        'x-tenant-id': tenantId,
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      },
    );
  }

  async disableConnector(tenantId: string, id: string): Promise<any> {
    return this.post(
      `/api/v1/connectors/${id}/disable`,
      {},
      { 'x-tenant-id': tenantId },
    );
  }

  /**
   * Hand an inbound signed webhook to shield-ingest unchanged. The signature
   * covers the exact bytes the sender transmitted, so the body is forwarded as
   * the raw Buffer, never re-serialised.
   *
   * Deliberately carries NO workload token: ingest's webhook route is public
   * ingress verified by the HMAC alone, so there is nothing to gain by handing
   * a service credential to a route reachable from the internet.
   *
   * Never throws for an upstream answer: the caller relays `status`. A 5xx or
   * an unreachable ingest is reported as a bare 502/503/504 so internal
   * detail does not reach an unauthenticated sender.
   */
  async forwardWebhook(
    connectorId: string,
    rawBody: Buffer,
    headers: Record<string, string>,
  ): Promise<{ status: number; body: unknown }> {
    let res: Response;
    try {
      res = await fetch(
        `${SHIELD_INGEST_BASE_URL}/api/v1/ingestion/webhooks/${encodeURIComponent(connectorId)}`,
        {
          method: 'POST',
          headers,
          body: new Uint8Array(rawBody),
          signal: AbortSignal.timeout(SHIELD_INGEST_TIMEOUT_MS),
        },
      );
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError');
      this.logger.warn(
        `Webhook forward to ingest failed (${timedOut ? 'timeout' : 'unreachable'}) for connector ${connectorId}`,
      );
      return {
        status: timedOut ? 504 : 503,
        body: {
          statusCode: timedOut ? 504 : 503,
          message: 'Webhook ingestion is temporarily unavailable',
        },
      };
    }

    let parsed: any = null;
    try {
      parsed = await res.json();
    } catch {
      /* empty or non-JSON body */
    }

    if (res.status >= 500) {
      this.logger.warn(
        `Ingest answered ${res.status} to webhook for connector ${connectorId}`,
      );
      return {
        status: 502,
        body: {
          statusCode: 502,
          message: 'Webhook ingestion is temporarily unavailable',
        },
      };
    }
    if (res.status >= 400) {
      // ingest's decision about this delivery (bad signature, replay, …).
      // Relay only the fields a sender needs, not whatever else it attached.
      return {
        status: res.status,
        body: {
          statusCode: res.status,
          message:
            typeof parsed?.message === 'string'
              ? parsed.message
              : 'Webhook rejected',
          error: typeof parsed?.error === 'string' ? parsed.error : undefined,
        },
      };
    }
    return { status: res.status, body: parsed ?? {} };
  }

  async getWebhookSecretStatus(tenantId: string, id: string): Promise<any> {
    return this.get(`/api/v1/connectors/${id}/webhook-secret`, {
      'x-tenant-id': tenantId,
    });
  }

  async revealWebhookSecret(tenantId: string, id: string): Promise<any> {
    return this.post(
      `/api/v1/connectors/${id}/webhook-secret/reveal`,
      {},
      { 'x-tenant-id': tenantId },
    );
  }

  async rotateWebhookSecret(
    tenantId: string,
    id: string,
    body: { immediate?: boolean },
  ): Promise<any> {
    return this.post(`/api/v1/connectors/${id}/webhook-secret/rotate`, body, {
      'x-tenant-id': tenantId,
    });
  }

  async heartbeatConnector(
    tenantId: string,
    id: string,
    body?: Record<string, unknown>,
  ): Promise<any> {
    return this.post(`/api/v1/connectors/${id}/heartbeat`, body || {}, {
      'x-tenant-id': tenantId,
    });
  }

  async triggerDlqAutoRetry(tenantId: string, limit?: string): Promise<any> {
    const q = limit ? `?limit=${encodeURIComponent(limit)}` : '';
    return this.post(
      `/api/v1/dlq/auto-retry${q}`,
      {},
      { 'x-tenant-id': tenantId },
    );
  }

  async getDlqMetrics(tenantId: string): Promise<any> {
    return this.get('/api/v1/dlq/metrics', { 'x-tenant-id': tenantId });
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

  // --- Email Security Telemetry (shield-ingest) ---
  /** The access token is short-lived and minted by core from its vault; ingest never stores it. */
  async testEmailSource(
    tenantId: string,
    connectionId: string,
    payload: { accessToken: string },
  ): Promise<any> {
    return this.post(
      `/api/v1/email-ingest/sources/${encodeURIComponent(connectionId)}/test`,
      payload,
      { 'x-tenant-id': tenantId },
    );
  }

  /** Provider pull. Events and expected counts come from the provider, never from a caller. */
  async syncEmailSource(
    tenantId: string,
    connectionId: string,
    payload: { accessToken: string; cursor?: string | null; maxPages?: number },
  ): Promise<any> {
    return this.post(
      `/api/v1/email-ingest/sources/${encodeURIComponent(connectionId)}/sync`,
      payload,
      { 'x-tenant-id': tenantId },
    );
  }

  async requestEmailBackfill(
    tenantId: string,
    connectionId: string,
    payload: {
      actorId: string;
      windowStart: string;
      windowEnd: string;
      reason: string;
    },
  ): Promise<any> {
    return this.post(
      `/api/v1/email-ingest/sources/${encodeURIComponent(connectionId)}/backfills`,
      payload,
      { 'x-tenant-id': tenantId },
    );
  }

  // --- Events & Telemetry ---
  /** Counts of events received, including how many arrived in the last `hours`. */
  async getEventMetrics(tenantId: string, hours?: number): Promise<any> {
    const query = hours ? `?hours=${hours}` : '';
    return this.get(`/api/v1/dashboard/events${query}`, {
      'x-tenant-id': tenantId,
    });
  }

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
        signal: AbortSignal.timeout(SHIELD_INGEST_TIMEOUT_MS),
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
        signal: AbortSignal.timeout(SHIELD_INGEST_TIMEOUT_MS),
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
        signal: AbortSignal.timeout(SHIELD_INGEST_TIMEOUT_MS),
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
        signal: AbortSignal.timeout(SHIELD_INGEST_TIMEOUT_MS),
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
