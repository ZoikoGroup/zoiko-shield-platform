import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  assertPermittedAuthorization,
  AuthorizationDecisionService,
} from './authorization-decision.service';

describe('AuthorizationDecisionService', () => {
  const input = {
    actorId: 'principal-1',
    tenantId: 'tenant-a',
    environmentId: 'env-a',
    action: 'case:read',
    effectClass: 'READ' as const,
    resourceType: 'case',
    resourceId: 'case-1',
    resourceTenantId: 'tenant-a',
    purpose: 'security-investigation',
    requiredPermissions: ['case:read'],
    assurance: 'FEDERATED_MFA' as const,
    riskState: 'NORMAL',
    policyVersion: 'iam-policy-1.0.0',
    correlationId: 'correlation-1',
  };

  function setup() {
    const prisma = {
      authorizationDecision: {
        create: jest.fn().mockImplementation(({ data }) => ({
          id: 'decision-1',
          ...data,
        })),
      },
      entitlement: { findFirst: jest.fn() },
      relationship: { findFirst: jest.fn() },
      partnerPrincipalContext: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      partnerDelegation: { findFirst: jest.fn() },
    };
    const authorization = {
      hasTenantAccess: jest.fn().mockResolvedValue(true),
      getPermissionCodesForPrincipal: jest
        .fn()
        .mockResolvedValue(['case:read']),
    };
    return {
      prisma,
      authorization,
      service: new AuthorizationDecisionService(
        prisma as never,
        authorization as never,
      ),
    };
  }

  it('permits only after current membership and permissions resolve', async () => {
    const { service, prisma, authorization } = setup();

    await expect(service.evaluate(input)).resolves.toEqual({
      authorizationDecisionId: 'decision-1',
      decision: 'PERMIT',
      reasonCode: 'POLICY_PERMIT',
      obligations: ['AUDIT_MATERIAL_READ'],
    });
    expect(authorization.hasTenantAccess).toHaveBeenCalledWith(
      'tenant-a',
      'principal-1',
    );
    expect(prisma.authorizationDecision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        decision: 'PERMIT',
        reason_code: 'POLICY_PERMIT',
        purpose: 'security-investigation',
        required_permissions: '["case:read"]',
        context_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
  });

  it('denies cross-tenant resource context before membership lookup', async () => {
    const { service, authorization } = setup();

    const result = await service.evaluate({
      ...input,
      resourceTenantId: 'tenant-b',
    });

    expect(result.decision).toBe('DENY');
    expect(result.reasonCode).toBe('CROSS_TENANT_RESOURCE');
    expect(authorization.hasTenantAccess).not.toHaveBeenCalled();
  });

  it('resolves a cross-cutting permission from PLATFORM_SCOPE while retaining the real target tenant', async () => {
    const { service, authorization, prisma } = setup();
    authorization.getPermissionCodesForPrincipal.mockResolvedValue([
      'deletion:approve',
    ]);

    const result = await service.evaluate({
      ...input,
      tenantId: 'tenant-a',
      authorizationScopeId: '00000000-0000-0000-0000-000000000000',
      action: 'deletion:approve',
      resourceType: 'DeletionRequest',
      resourceTenantId: 'tenant-a',
      requiredPermissions: ['deletion:approve'],
      effectClass: 'DESTRUCTIVE',
    });

    expect(result.decision).toBe('PERMIT');
    expect(authorization.hasTenantAccess).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000000',
      'principal-1',
    );
    expect(prisma.authorizationDecision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenant_id: 'tenant-a' }),
    });
  });

  it('does not let PLATFORM_SCOPE authorize an ordinary tenant permission', async () => {
    const { service, authorization } = setup();

    const result = await service.evaluate({
      ...input,
      authorizationScopeId: '00000000-0000-0000-0000-000000000000',
    });

    expect(result.decision).toBe('DENY');
    expect(result.reasonCode).toBe('AUTHORIZATION_SCOPE_MISMATCH');
    expect(authorization.hasTenantAccess).not.toHaveBeenCalled();
  });

  it('denies a principal without active tenant membership', async () => {
    const { service, authorization } = setup();
    authorization.hasTenantAccess.mockResolvedValue(false);

    const result = await service.evaluate(input);

    expect(result.decision).toBe('DENY');
    expect(result.reasonCode).toBe('ACTIVE_MEMBERSHIP_REQUIRED');
  });

  it('denies when an active entitlement required by policy is absent', async () => {
    const { service, prisma } = setup();
    prisma.entitlement.findFirst.mockResolvedValue(null);

    const result = await service.evaluate({
      ...input,
      requiredEntitlement: 'AI_SECURITY',
    });

    expect(result.decision).toBe('DENY');
    expect(result.reasonCode).toBe('ACTIVE_ENTITLEMENT_REQUIRED');
  });

  it('returns a step-up obligation when assurance is insufficient', async () => {
    const { service } = setup();

    const result = await service.evaluate({
      ...input,
      assurance: 'PASSWORD',
      requiredAssurance: ['PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY'],
    });

    expect(result.decision).toBe('DENY');
    expect(result.reasonCode).toBe('STEP_UP_REQUIRED');
    expect(result.obligations).toContain('REQUIRE_FRESH_STEP_UP');
  });

  it('denies an authoritative partner identity on an ordinary tenant read with no declared delegation scope', async () => {
    const { service, prisma, authorization } = setup();
    prisma.partnerPrincipalContext.findUnique.mockResolvedValue({
      id: 'partner-context-1',
      status: 'ACTIVE',
      managing_organization_id: 'mssp-org-1',
    });
    authorization.getPermissionCodesForPrincipal.mockResolvedValue([
      'case:read',
      'tenant:partner-delegation:use',
    ]);

    const result = await service.evaluate(input);

    expect(result.decision).toBe('DENY');
    expect(result.reasonCode).toBe('PARTNER_DELEGATION_CONTEXT_REQUIRED');
    expect(prisma.partnerDelegation.findFirst).not.toHaveBeenCalled();
  });

  it('permits a partner operation only when the exact customer-visible grant contains its declared scope', async () => {
    const { service, prisma, authorization } = setup();
    prisma.partnerPrincipalContext.findUnique.mockResolvedValue({
      id: 'partner-context-1',
      status: 'ACTIVE',
      managing_organization_id: 'mssp-org-1',
    });
    prisma.partnerDelegation.findFirst.mockResolvedValue({
      scope: '["VIEW_TICKETS"]',
    });
    authorization.getPermissionCodesForPrincipal.mockResolvedValue([
      'case:read',
      'tenant:partner-delegation:use',
    ]);

    const result = await service.evaluate({
      ...input,
      partnerDelegationScope: 'VIEW_TICKETS',
      partnerCommercialAccountId: 'account-1',
      partnerManagingOrganizationId: 'mssp-org-1',
    });

    expect(result.decision).toBe('PERMIT');
    expect(prisma.partnerDelegation.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        partner_principal_context_id: 'partner-context-1',
        partner_principal_id: 'principal-1',
        commercial_account_id: 'account-1',
        tenant_id: 'tenant-a',
        environment_id: 'env-a',
        customer_visible: true,
      }),
      select: { scope: true },
    });
  });

  it('denies a partner request whose managing organization header differs from identity authority', async () => {
    const { service, prisma, authorization } = setup();
    prisma.partnerPrincipalContext.findUnique.mockResolvedValue({
      id: 'partner-context-1',
      status: 'ACTIVE',
      managing_organization_id: 'mssp-org-1',
    });
    authorization.getPermissionCodesForPrincipal.mockResolvedValue([
      'case:read',
      'tenant:partner-delegation:use',
    ]);

    const result = await service.evaluate({
      ...input,
      partnerDelegationScope: 'VIEW_TICKETS',
      partnerCommercialAccountId: 'account-1',
      partnerManagingOrganizationId: 'another-org',
    });

    expect(result.decision).toBe('DENY');
    expect(result.reasonCode).toBe('PARTNER_MANAGING_ORGANIZATION_MISMATCH');
  });

  it('records INDETERMINATE and fails closed when an authority is unavailable', async () => {
    const { service, authorization, prisma } = setup();
    authorization.getPermissionCodesForPrincipal.mockRejectedValue(
      new Error('membership database unavailable'),
    );

    const result = await service.evaluate(input);

    expect(result.decision).toBe('INDETERMINATE');
    expect(result.reasonCode).toBe('POLICY_DEPENDENCY_UNAVAILABLE');
    expect(prisma.authorizationDecision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ decision: 'INDETERMINATE' }),
    });
  });

  it('represents non-applicable policy distinctly without permitting', async () => {
    const { service } = setup();

    const result = await service.evaluate({ ...input, applicable: false });

    expect(result.decision).toBe('NOT_APPLICABLE');
    expect(result.obligations).toContain('DENY_EXECUTION');
  });

  it('enforces DENY and INDETERMINATE as distinct fail-closed outcomes', () => {
    expect(() =>
      assertPermittedAuthorization({
        authorizationDecisionId: 'decision-deny',
        decision: 'DENY',
        reasonCode: 'PERMISSION_REQUIRED',
        obligations: ['DENY_EXECUTION'],
      }),
    ).toThrow(ForbiddenException);

    expect(() =>
      assertPermittedAuthorization({
        authorizationDecisionId: 'decision-indeterminate',
        decision: 'INDETERMINATE',
        reasonCode: 'POLICY_DEPENDENCY_UNAVAILABLE',
        obligations: ['DENY_EXECUTION'],
      }),
    ).toThrow(ServiceUnavailableException);
  });
});
