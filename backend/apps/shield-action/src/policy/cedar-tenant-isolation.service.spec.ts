import { CedarTenantIsolationService, CedarDecisionContext } from './cedar-tenant-isolation.service';

describe('CedarTenantIsolationService (LAB 12 Negative Authorization Matrix)', () => {
  let cedarService: CedarTenantIsolationService;

  const validBaseContext: CedarDecisionContext = {
    principal: {
      id: 'analyst-101',
      type: 'HUMAN_USER',
      tenantId: 'tenant-corp-a',
      legalEntityId: 'le-us-east',
      roles: ['SOC_LEAD'],
      sessionId: 'sess-001',
    },
    resource: {
      id: 'case-9988',
      type: 'Case',
      tenantId: 'tenant-corp-a',
      legalEntityId: 'le-us-east',
      environment: 'PRODUCTION',
    },
    action: {
      name: 'action.isolate_endpoint',
      authorityLevel: 'R2_GOVERNED_CONTAINMENT',
    },
    governance: {
      purpose: 'incident_investigation',
      caseReference: 'INC-2026-99',
      approvalRef: 'appr-lead-01',
      policyBundleVersion: 'v2.4.0',
    },
  };

  beforeEach(() => {
    cedarService = new CedarTenantIsolationService();
  });

  it('1. should deny same user targeting different tenant (CROSS_TENANT)', () => {
    const ctx: CedarDecisionContext = {
      ...validBaseContext,
      resource: { ...validBaseContext.resource, tenantId: 'tenant-corp-b' },
    };
    const res = cedarService.evaluateAuthorization(ctx);
    expect(res.decision).toBe('DENY');
    expect(res.reasonCode).toBe('DENIED_CROSS_TENANT_ACCESS');
  });

  it('2. should deny same tenant targeting different legal entity', () => {
    const ctx: CedarDecisionContext = {
      ...validBaseContext,
      resource: { ...validBaseContext.resource, legalEntityId: 'le-eu-west' },
    };
    const res = cedarService.evaluateAuthorization(ctx);
    expect(res.decision).toBe('DENY');
    expect(res.reasonCode).toBe('DENIED_WRONG_LEGAL_ENTITY');
  });

  it('3. should deny actions with stale or missing approvals', () => {
    const ctx: CedarDecisionContext = {
      ...validBaseContext,
      governance: { ...validBaseContext.governance, isApprovalStale: true },
    };
    const res = cedarService.evaluateAuthorization(ctx);
    expect(res.decision).toBe('DENY');
    expect(res.reasonCode).toBe('DENIED_STALE_OR_EXPIRED_APPROVAL');
  });

  it('4. should deny requests missing mandatory purpose', () => {
    const ctx: CedarDecisionContext = {
      ...validBaseContext,
      governance: { ...validBaseContext.governance, purpose: '' },
    };
    const res = cedarService.evaluateAuthorization(ctx);
    expect(res.decision).toBe('DENY');
    expect(res.reasonCode).toBe('DENIED_MISSING_PURPOSE');
  });

  it('5. should deny when principal lacks required authority role', () => {
    const ctx: CedarDecisionContext = {
      ...validBaseContext,
      principal: { ...validBaseContext.principal, roles: ['SOC_ANALYST'] }, // Needs SOC_LEAD for R2
    };
    const res = cedarService.evaluateAuthorization(ctx);
    expect(res.decision).toBe('DENY');
    expect(res.reasonCode).toBe('DENIED_REVOKED_OR_INSUFFICIENT_ROLE');
  });

  it('6. should fail-closed when policy bundle is unavailable', () => {
    const res = cedarService.evaluateAuthorization(validBaseContext, false);
    expect(res.decision).toBe('DENY');
    expect(res.reasonCode).toBe('DENIED_POLICY_BUNDLE_UNAVAILABLE');
  });

  it('7. should deny support delegate without customer JIT grant', () => {
    const ctx: CedarDecisionContext = {
      ...validBaseContext,
      principal: { ...validBaseContext.principal, type: 'SUPPORT_DELEGATE' },
      governance: { ...validBaseContext.governance, hasCustomerSupportGrant: false },
    };
    const res = cedarService.evaluateAuthorization(ctx);
    expect(res.decision).toBe('DENY');
    expect(res.reasonCode).toBe('DENIED_SUPPORT_WITHOUT_CUSTOMER_JIT_GRANT');
  });

  it('8. should deny AI agent attempting direct resource access', () => {
    const ctx: CedarDecisionContext = {
      ...validBaseContext,
      principal: { ...validBaseContext.principal, type: 'AI_AGENT' },
    };
    const res = cedarService.evaluateAuthorization(ctx);
    expect(res.decision).toBe('DENY');
    expect(res.reasonCode).toBe('DENIED_AI_AGENT_DIRECT_RESOURCE_ACCESS');
  });

  it('should permit authorized request meeting all context constraints', () => {
    const res = cedarService.evaluateAuthorization(validBaseContext);
    expect(res.decision).toBe('ALLOW');
    expect(res.reasonCode).toBe('PERMITTED_BY_POLICY');
  });
});
