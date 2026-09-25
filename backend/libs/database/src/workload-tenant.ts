import { BadRequestException } from '@nestjs/common';
import { bindRequestTenant } from './db-scope';

interface WorkloadRequest {
  headers: Record<string, unknown>;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: unknown;
}

/**
 * For a request already authenticated as another ZoikoShield service (signed,
 * audience-bound workload token), bind the tenant it names to the request's
 * database scope. The calling service has verified the end user's authority
 * over that tenant; this service trusts the workload identity, not the header.
 *
 * The tenant may arrive as the x-tenant-id header, a route or query parameter,
 * or the body's tenantId; all that are present must agree. A request naming
 * no tenant stays unscoped and sees no tenant rows.
 */
export function bindWorkloadRequestTenant(
  request: WorkloadRequest,
): string | undefined {
  const body =
    request.body && typeof request.body === 'object'
      ? (request.body as Record<string, unknown>)
      : {};
  const candidates = [
    request.headers['x-tenant-id'],
    request.params?.tenantId,
    request.query?.tenantId,
    body.tenantId,
  ].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  const tenantIds = [...new Set(candidates)];
  if (tenantIds.length > 1) {
    throw new BadRequestException(
      'Conflicting tenant identifiers were supplied',
    );
  }
  if (tenantIds.length === 0 || tenantIds[0] === 'default-tenant')
    return undefined;
  bindRequestTenant(tenantIds[0]);
  return tenantIds[0];
}
