import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { createWorkloadToken } from '../../../../libs/security/src/workload-token';
import { InternalAuthGuard } from './internal-auth.guard';

describe('InternalAuthGuard', () => {
  const originalEnvironment = { ...process.env };

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.SERVICE_NAME = 'shield-core';
    process.env.WORKLOAD_IDENTITY_DEV_SECRET =
      'unit-test-workload-secret-with-sufficient-entropy';
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  function context(authorization: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization, 'x-tenant-id': 'tenant-a' },
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('accepts a workload token for shield-ai and rejects one for another audience', () => {
    const guard = new InternalAuthGuard();
    expect(
      guard.canActivate(context(`Bearer ${createWorkloadToken('shield-ai')}`)),
    ).toBe(true);
    expect(() =>
      guard.canActivate(
        context(`Bearer ${createWorkloadToken('shield-ingest')}`),
      ),
    ).toThrow(UnauthorizedException);
  });

  it.each([
    'demo-jwt-session-token-998811',
    'jwt-bearer-anything',
    'demo-anything',
  ])(
    'rejects the user-session demo token %s (no internal-service identity)',
    (token) => {
      expect(() =>
        new InternalAuthGuard().canActivate(context(`Bearer ${token}`)),
      ).toThrow(UnauthorizedException);
    },
  );
});
