import { Injectable, Logger } from '@nestjs/common';
import { workloadAuthorizationHeaders } from '../../../../libs/security/src/workload-token';

const SHIELD_CORE_BASE_URL =
  process.env.SHIELD_CORE_BASE_URL || 'http://localhost:3001';

export class ShieldCoreUnreachableError extends Error {}
export class TenantNotFoundError extends Error {}
export class AlertNotFoundError extends Error {}

export interface TenantResidencyContext {
  tenantId: string;
  homeRegion: string;
  dataResidencyRegion: string;
  status: string;
}

/**
 * shield-ingest's ONLY window into shield-core-owned tenant data. Residency
 * is committed once at onboarding and stored in shield-core's TypeORM
 * `tenant.tenants` table, which has no Prisma model — it cannot be read
 * locally and must never be inferred from a client-supplied request field.
 */
@Injectable()
export class ShieldCoreClient {
  private readonly logger = new Logger(ShieldCoreClient.name);

  /**
   * Escalate an alert to a case. Cases are shield-core-owned (architecture
   * spec §07), so shield-ingest asks for one rather than writing to the Case
   * tables behind shield-core's back.
   */
  async promoteAlertToCase(input: {
    tenantId: string;
    alertId: string;
    actorId?: string;
    title?: string;
    description?: string;
  }): Promise<{ id: string; status: string; title: string }> {
    let response: Response;
    try {
      response = await fetch(
        `${SHIELD_CORE_BASE_URL}/internal/v1/cases/from-alert`,
        {
          method: 'POST',
          headers: {
            ...workloadAuthorizationHeaders('shield-core'),
            'content-type': 'application/json',
            'x-tenant-id': input.tenantId,
          },
          body: JSON.stringify(input),
        },
      );
    } catch (err) {
      this.logger.error(`shield-core unreachable: ${(err as Error).message}`);
      throw new ShieldCoreUnreachableError(
        'shield-core unreachable during alert promotion',
      );
    }

    if (response.status === 404) {
      throw new AlertNotFoundError(
        `Alert '${input.alertId}' not found for tenant '${input.tenantId}'`,
      );
    }
    if (!response.ok) {
      throw new ShieldCoreUnreachableError(
        `shield-core returned ${response.status} for alert promotion`,
      );
    }

    const body = await response.json();
    return body.data;
  }

  async getTenantResidency(tenantId: string): Promise<TenantResidencyContext> {
    let response: Response;
    try {
      response = await fetch(
        `${SHIELD_CORE_BASE_URL}/internal/v1/tenants/${tenantId}/residency`,
        {
          headers: {
            ...workloadAuthorizationHeaders('shield-core'),
            'x-tenant-id': tenantId,
          },
        },
      );
    } catch (err) {
      this.logger.error(`shield-core unreachable: ${(err as Error).message}`);
      throw new ShieldCoreUnreachableError(
        'shield-core unreachable during tenant residency resolution',
      );
    }

    if (response.status === 404) {
      throw new TenantNotFoundError(`Tenant '${tenantId}' not found`);
    }
    if (!response.ok) {
      throw new ShieldCoreUnreachableError(
        `shield-core returned ${response.status} for tenant residency`,
      );
    }

    const body = await response.json();
    return body.data as TenantResidencyContext;
  }
}
