import { PolicyReauthorizationService } from './policy-reauthorization.service';
import { ActionAuthorizationContext } from '../internal-client/action-authorization-context.types';

function baseContext(overrides: Partial<ActionAuthorizationContext> = {}): ActionAuthorizationContext {
  return {
    tenantId: 't1',
    environmentId: 'e1',
    proposalId: 'p1',
    actionType: 'REVOKE_SESSIONS',
    targetType: 'IDENTITY',
    targetId: 'id1',
    authorityLevel: 'R1',
    proposalStatus: 'APPROVED',
    approval: { approvalId: 'a1', decision: 'APPROVED', approverId: 'u1', expiresAt: new Date(Date.now() + 60_000).toISOString() },
    policyVersion: '1.0',
    authorizationDecisionId: 'ad1',
    entitlementAllowed: true,
    targetState: { verified: false },
    proposalVersion: 1,
    approvedMaterialHash: 'hash',
    correlationId: 'c1',
    ...overrides,
  };
}

describe('PolicyReauthorizationService', () => {
  const service = new PolicyReauthorizationService();

  it('allows a valid R1 approved proposal', () => {
    expect(service.check(baseContext())).toEqual({ allowed: true });
  });

  it('denies when proposal status is not APPROVED', () => {
    const result = service.check(baseContext({ proposalStatus: 'PROPOSED' }));
    expect(result.allowed).toBe(false);
  });

  it('denies R2/R3/R4 authority levels — no live path is enabled this milestone', () => {
    expect(service.check(baseContext({ authorityLevel: 'R2_PRE_AUTHORIZED_LOW_RISK' })).allowed).toBe(false);
    expect(service.check(baseContext({ authorityLevel: 'R3_HIGH_IMPACT' })).allowed).toBe(false);
    expect(service.check(baseContext({ authorityLevel: 'R4_EMERGENCY' })).allowed).toBe(false);
  });

  it('denies when entitlement was not allowed', () => {
    expect(service.check(baseContext({ entitlementAllowed: false })).allowed).toBe(false);
  });

  it('denies when policyVersion is missing', () => {
    expect(service.check(baseContext({ policyVersion: '' })).allowed).toBe(false);
  });

  it('denies when authorizationDecisionId is missing', () => {
    expect(service.check(baseContext({ authorizationDecisionId: '' })).allowed).toBe(false);
  });
});
