import { SimulationService } from './simulation.service';
import { ActionAuthorizationContext } from '../internal-client/action-authorization-context.types';

function baseContext(overrides: Partial<ActionAuthorizationContext> = {}): ActionAuthorizationContext {
  return {
    tenantId: 't1',
    environmentId: 'e1',
    proposalId: 'p1',
    caseId: 'case1',
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

function buildService(context: ActionAuthorizationContext, overrides: Partial<{ policyAllowed: boolean; approvalAllowed: boolean; frozen: boolean; rateAllowed: boolean }> = {}) {
  const prisma = {
    actionCommand: { create: jest.fn().mockReturnValue({ id: 'cmd1' }) },
    actionReceipt: { create: jest.fn().mockReturnValue({ id: 'rcpt1' }) },
    outboxEvent: { create: jest.fn().mockReturnValue({ id: 'outbox1' }) },
    $transaction: jest.fn().mockResolvedValue([{ id: 'cmd1' }, { id: 'rcpt1' }, { id: 'outbox1' }]),
  } as any;
  const outbox = { build: jest.fn().mockReturnValue({}) } as any;
  const shieldCoreClient = { getAuthorizationContext: jest.fn().mockResolvedValue(context) } as any;
  const policy = { check: jest.fn().mockReturnValue({ allowed: overrides.policyAllowed ?? true, reason: 'policy denied' }) } as any;
  const approval = { check: jest.fn().mockReturnValue({ allowed: overrides.approvalAllowed ?? true, reason: 'approval denied' }) } as any;
  const freeze = { isFrozen: jest.fn().mockResolvedValue({ frozen: overrides.frozen ?? false, reason: 'frozen' }) } as any;
  const rateControl = { checkCeiling: jest.fn().mockResolvedValue({ allowed: overrides.rateAllowed ?? true, reason: 'rate denied' }) } as any;
  const signer = { sign: jest.fn().mockReturnValue({ signature: 'dev-sim:abc', signedBy: 'DevSimulationSigner', signedAt: new Date().toISOString() }) } as any;
  const dispatcher = { dispatchSimulated: jest.fn().mockReturnValue({ target: {}, expectedAction: 'x', blastRadius: 'SIMULATION_ONLY', authorityLevel: 'R1' }) } as any;

  const service = new SimulationService(prisma, outbox, shieldCoreClient, policy, approval, freeze, rateControl, signer, dispatcher);
  return { service, prisma, signer, freeze, rateControl, policy, approval };
}

describe('SimulationService', () => {
  it('produces a SIMULATED outcome when every reauthorization check passes', async () => {
    const { service, prisma } = buildService(baseContext());
    const outcome = await service.simulate('p1', 'corr1');
    expect(outcome.status).toBe('SIMULATED');
    expect(outcome.actionCommandId).toBeDefined();
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('rejects and never persists anything when policy check fails', async () => {
    const { service, prisma } = buildService(baseContext(), { policyAllowed: false });
    const outcome = await service.simulate('p1', 'corr1');
    expect(outcome.status).toBe('REJECTED');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects on an expired/invalid approval (fails closed, never persists)', async () => {
    const { service, prisma } = buildService(baseContext(), { approvalAllowed: false });
    const outcome = await service.simulate('p1', 'corr1');
    expect(outcome.status).toBe('REJECTED');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects when the tenant is frozen', async () => {
    const { service, prisma } = buildService(baseContext(), { frozen: true });
    const outcome = await service.simulate('p1', 'corr1');
    expect(outcome.status).toBe('REJECTED');
    expect(outcome.reason).toBe('frozen');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects when the rate ceiling is exceeded', async () => {
    const { service, prisma } = buildService(baseContext(), { rateAllowed: false });
    const outcome = await service.simulate('p1', 'corr1');
    expect(outcome.status).toBe('REJECTED');
    expect(outcome.reason).toBe('rate denied');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('only signs via DevSimulationSigner in SIMULATION mode', async () => {
    const { service, signer } = buildService(baseContext());
    await service.simulate('p1', 'corr1');
    expect(signer.sign).toHaveBeenCalledWith(expect.anything(), 'SIMULATION');
  });
});
