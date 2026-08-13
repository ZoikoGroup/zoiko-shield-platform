import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createWorkloadToken } from '../../../../libs/security/src/workload-token';
import { WorkloadAuthGuard } from './workload-auth.guard';

describe('WorkloadAuthGuard', () => {
  const originalEnvironment = { ...process.env };

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.SERVICE_NAME = 'shield-core';
    process.env.WORKLOAD_IDENTITY_DEV_SECRET = 'unit-test-workload-secret-with-sufficient-entropy';
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  function context(authorization: string): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ headers: { authorization, 'x-tenant-id': 'tenant-a' } }) }),
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
    } as unknown as ExecutionContext;
  }

  it('accepts the correct audience and rejects replay into another service audience', () => {
    const token = createWorkloadToken('shield-ingest');
    const guard = new WorkloadAuthGuard(new Reflector());
    expect(guard.canActivate(context(`Bearer ${token}`))).toBe(true);

    const wrongAudience = createWorkloadToken('shield-ai');
    expect(() => guard.canActivate(context(`Bearer ${wrongAudience}`))).toThrow(UnauthorizedException);
  });
});
