import { ApprovalReauthorizationService } from './approval-reauthorization.service';
import { ContentHashService } from '../hashing/content-hash.service';
import { ActionAuthorizationContext } from '../internal-client/action-authorization-context.types';

function buildContext(
  hashService: ContentHashService,
  overrides: Partial<ActionAuthorizationContext> = {},
): ActionAuthorizationContext {
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const base: ActionAuthorizationContext = {
    tenantId: 't1',
    environmentId: 'e1',
    proposalId: 'p1',
    actionType: 'REVOKE_SESSIONS',
    targetType: 'IDENTITY',
    targetId: 'id1',
    authorityLevel: 'R1',
    proposalStatus: 'APPROVED',
    approval: {
      approvalId: 'a1',
      decision: 'APPROVED',
      approverId: 'u1',
      expiresAt,
    },
    policyVersion: '1.0',
    authorizationDecisionId: 'ad1',
    entitlementAllowed: true,
    targetState: { verified: false },
    proposalVersion: 1,
    approvedMaterialHash: null,
    correlationId: 'c1',
    ...overrides,
  };

  if (base.approvedMaterialHash === null && base.approval) {
    const { contentHash } = hashService.hashCanonicalJson({
      tenantId: base.tenantId,
      environmentId: base.environmentId,
      proposalId: base.proposalId,
      proposalVersion: base.proposalVersion,
      actionType: base.actionType,
      targetType: base.targetType,
      targetId: base.targetId,
      authorityLevel: base.authorityLevel,
      policyVersion: base.policyVersion,
      approvalExpiresAt: base.approval.expiresAt,
    });
    base.approvedMaterialHash = contentHash;
  }

  return base;
}

describe('ApprovalReauthorizationService', () => {
  const hashService = new ContentHashService();
  const service = new ApprovalReauthorizationService(hashService);

  it('allows a valid, unexpired, hash-matching approval', () => {
    const context = buildContext(hashService);
    expect(service.check(context)).toEqual({ allowed: true });
  });

  it('denies when there is no approval', () => {
    const context = buildContext(hashService, { approval: null });
    expect(service.check(context).allowed).toBe(false);
  });

  it('denies an expired approval even though action.approved.v1 was already published', () => {
    const context = buildContext(hashService, {
      approval: {
        approvalId: 'a1',
        decision: 'APPROVED',
        approverId: 'u1',
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      },
    });
    // approvedMaterialHash was computed against the expired timestamp already baked into buildContext defaults,
    // so this exercises the expiry branch specifically.
    const result = service.check(context);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/expired/);
  });

  it('fails closed when the proposal material changed after approval (hash mismatch)', () => {
    // Hash is computed against the original material, then the proposal's
    // targetId is mutated afterward — simulating tampering post-approval.
    const context = buildContext(hashService);
    context.targetId = 'id-tampered-after-approval';
    const result = service.check(context);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/mismatch/);
  });

  it('denies when the recorded decision is not APPROVED', () => {
    const context = buildContext(hashService);
    context.approval = { ...context.approval!, decision: 'REJECTED' };
    expect(service.check(context).allowed).toBe(false);
  });
});
