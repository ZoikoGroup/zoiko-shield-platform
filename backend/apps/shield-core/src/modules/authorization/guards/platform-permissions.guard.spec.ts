import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationDecisionService } from '../../authorization-decision/authorization-decision.service';
import { PLATFORM_SCOPE } from '../constants';
import { PlatformPermissionsGuard } from './platform-permissions.guard';

function context(user: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class PlatformController {},
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'POST',
        params: {},
        headers: {},
        user,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('PlatformPermissionsGuard', () => {
  const platformUser = {
    id: 'platform-principal',
    tenantId: PLATFORM_SCOPE,
    environmentId: null,
    assurance: 'FEDERATED_MFA',
    riskState: 'NORMAL',
    policyVersion: 'iam-policy-1.0.0',
  };

  it('requires an explicit platform permission declaration', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new PlatformPermissionsGuard(reflector, {
      evaluate: jest.fn(),
    } as unknown as AuthorizationDecisionService);

    await expect(guard.canActivate(context(platformUser))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects a customer-tenant session before PDP evaluation', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['platform:tenant:onboard']),
    } as unknown as Reflector;
    const decision = { evaluate: jest.fn() };
    const guard = new PlatformPermissionsGuard(
      reflector,
      decision as unknown as AuthorizationDecisionService,
    );

    await expect(
      guard.canActivate(context({ ...platformUser, tenantId: 'tenant-a' })),
    ).rejects.toThrow(ForbiddenException);
    expect(decision.evaluate).not.toHaveBeenCalled();
  });

  it('allows only a persisted PERMIT decision', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['platform:tenant:onboard']),
    } as unknown as Reflector;
    const decision = {
      evaluate: jest.fn().mockResolvedValue({
        authorizationDecisionId: 'decision-1',
        decision: 'PERMIT',
        reasonCode: 'POLICY_PERMIT',
        obligations: ['AUDIT_WRITE'],
      }),
    };
    const guard = new PlatformPermissionsGuard(
      reflector,
      decision as unknown as AuthorizationDecisionService,
    );

    await expect(guard.canActivate(context(platformUser))).resolves.toBe(true);
  });

  it('passes a declared step-up assurance requirement to the PDP', async () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValueOnce(['platform:commercial-account:manage'])
        .mockReturnValueOnce(['PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY']),
    } as unknown as Reflector;
    const decision = {
      evaluate: jest.fn().mockResolvedValue({
        authorizationDecisionId: 'decision-1',
        decision: 'PERMIT',
        reasonCode: 'POLICY_PERMIT',
        obligations: ['AUDIT_WRITE'],
      }),
    };
    const guard = new PlatformPermissionsGuard(
      reflector,
      decision as unknown as AuthorizationDecisionService,
    );

    await guard.canActivate(context(platformUser));

    expect(decision.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        requiredAssurance: ['PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY'],
      }),
    );
  });

  it('surfaces an indeterminate policy dependency as unavailable', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['platform:tenant:onboard']),
    } as unknown as Reflector;
    const decision = {
      evaluate: jest.fn().mockResolvedValue({
        authorizationDecisionId: 'decision-1',
        decision: 'INDETERMINATE',
        reasonCode: 'POLICY_DEPENDENCY_UNAVAILABLE',
        obligations: ['DENY_EXECUTION'],
      }),
    };
    const guard = new PlatformPermissionsGuard(
      reflector,
      decision as unknown as AuthorizationDecisionService,
    );

    await expect(guard.canActivate(context(platformUser))).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
