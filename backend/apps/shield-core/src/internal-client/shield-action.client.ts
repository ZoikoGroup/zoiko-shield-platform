import {
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { workloadAuthorizationHeaders } from '../../../../libs/security/src/workload-token';

const SHIELD_ACTION_BASE_URL =
  process.env.SHIELD_ACTION_BASE_URL || 'http://localhost:3004';
const SHIELD_ACTION_TIMEOUT_MS = Number(
  process.env.SHIELD_ACTION_TIMEOUT_MS || 10000,
);

@Injectable()
export class ShieldActionClient {
  private readonly logger = new Logger(ShieldActionClient.name);

  private headers(tenantId: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-tenant-id': tenantId,
      ...workloadAuthorizationHeaders('shield-action'),
    };
  }

  async simulateEmailAction(
    tenantId: string,
    payload: Record<string, unknown>,
  ): Promise<any> {
    return this.post('/internal/v1/email-actions/simulate', tenantId, payload);
  }

  async executeEmailAction(
    tenantId: string,
    payload: Record<string, unknown>,
  ): Promise<any> {
    return this.post('/internal/v1/email-actions/execute', tenantId, payload);
  }

  async rollbackEmailAction(
    tenantId: string,
    payload: Record<string, unknown>,
  ): Promise<any> {
    return this.post('/internal/v1/email-actions/rollback', tenantId, payload);
  }

  private async post(
    path: string,
    tenantId: string,
    body: Record<string, unknown>,
  ): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      SHIELD_ACTION_TIMEOUT_MS,
    );
    try {
      const response = await fetch(`${SHIELD_ACTION_BASE_URL}${path}`, {
        method: 'POST',
        headers: this.headers(tenantId),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 401
      ) {
        const text = await response.text().catch(() => '');
        let message: unknown = text;
        try {
          message = JSON.parse(text)?.message ?? text;
        } catch {
          // keep text
        }
        throw new HttpException(
          {
            statusCode: response.status,
            error: 'ACTION_REJECTED',
            message,
          },
          response.status,
        );
      }
      if (!response.ok) {
        throw new ServiceUnavailableException('ACTION_SERVICE_UNAVAILABLE');
      }
      return response.json();
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.warn(
        `shield-action request failed for path=${path}: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException('ACTION_SERVICE_UNAVAILABLE');
    } finally {
      clearTimeout(timer);
    }
  }
}
