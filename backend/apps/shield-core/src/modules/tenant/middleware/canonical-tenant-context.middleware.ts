import { BadRequestException, Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { CanonicalContext } from '../interfaces/canonical-context.interface';

export interface RequestWithCanonicalContext extends Request {
  canonicalContext?: CanonicalContext;
}

@Injectable()
export class CanonicalTenantContextMiddleware implements NestMiddleware {
  use(req: RequestWithCanonicalContext, res: Response, next: NextFunction) {
    // Public/health endpoints do not require tenant context
    const publicPaths = ['/health', '/health/ready', '/health/live', '/api/v1/auth/login', '/api/v1/auth/register'];
    if (publicPaths.some((p) => req.path.startsWith(p))) {
      return next();
    }

    const tenantId = (req.headers['x-tenant-id'] as string) || (req.query?.tenantId as string);
    const environmentId = req.headers['x-environment-id'] as string | undefined;
    const requestId = (req.headers['x-request-id'] as string) || `req-${Date.now()}`;
    const correlationId = (req.headers['x-correlation-id'] as string) || requestId;
    const purpose = (req.headers['x-purpose'] as string) || 'security-monitoring';

    if (tenantId === 'default-tenant') {
      throw new BadRequestException("'default-tenant' is not a valid tenant identifier");
    }

    if (tenantId) {
      const legalEntityId = req.headers['x-legal-entity-id'] as string | undefined;
      const region = req.headers['x-region'] as string | undefined;
      if (!legalEntityId || !environmentId || !region) {
        throw new BadRequestException(
          'x-legal-entity-id, x-environment-id, and x-region are required with tenant context',
        );
      }
      req.canonicalContext = {
        tenantId,
        legalEntityId,
        environmentId,
        region,
        actorId: (req.headers['x-actor-id'] as string) || undefined,
        workloadId: (req.headers['x-workload-id'] as string) || undefined,
        correlationId,
        causationId: (req.headers['x-causation-id'] as string) || undefined,
        traceId: (req.headers['x-trace-id'] as string) || correlationId,
        requestId,
        idempotencyKey: (req.headers['x-idempotency-key'] as string) || undefined,
        purpose,
        dataClass: (req.headers['x-data-class'] as string) || 'CONFIDENTIAL',
        policyVersion: '1.0.0',
        contractId: 'ERB-01',
        contractVersion: '1.0.0',
        recordedAt: new Date().toISOString(),
      };
    }

    next();
  }
}
