import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  EmailActionAdapterService,
  type EmailActionProposalInput,
} from './email-action-adapter.service';
import {
  EmailProviderMutationNotConfiguredError,
  NotConfiguredEmailProviderMutationPort,
  type EmailProviderMutationPort,
} from './email-provider-mutation.port';
import { ActionAuthorityService } from '../policy/action-authority.service';
import { BlastRadiusEvaluatorService } from '../rate-control/blast-radius-evaluator.service';

describe('EmailActionAdapterService (T18, T26, T27, T28, E13)', () => {
  const FUTURE = () => new Date(Date.now() + 10 * 60_000).toISOString();
  let freezeResult: { frozen: boolean; reason?: string };
  let port: EmailProviderMutationPort;
  let service: EmailActionAdapterService;

  const baseInput = (
    over: Partial<EmailActionProposalInput> = {},
  ): EmailActionProposalInput => ({
    proposalId: 'prop-1',
    tenantId: 'tenant-1',
    provider: 'MICROSOFT_365',
    requestedAction: 'QUARANTINE_MESSAGE',
    targetRefs: ['msg-1'],
    consentScope: 'Mail.ReadWrite',
    riskClass: 'R3',
    initiatedBy: 'analyst-1',
    approvedBy: 'lead-1',
    approvalExpiresAt: FUTURE(),
    hasDedicatedWriteCredential: true,
    ...over,
  });

  beforeEach(() => {
    process.env.ENABLE_EMAIL_PHASE2_ACTIONS = 'true';
    freezeResult = { frozen: false };
    port = {
      mutate: jest.fn(async (req) => ({
        targetRef: req.targetRef,
        status: 'VERIFIED' as const,
        providerReceiptId: `graph-${req.targetRef}`,
      })),
    };
    service = new EmailActionAdapterService(
      { isFrozen: jest.fn(async () => freezeResult) } as any,
      new ActionAuthorityService(),
      new BlastRadiusEvaluatorService(),
      port,
    );
  });
  afterEach(() => {
    delete process.env.ENABLE_EMAIL_PHASE2_ACTIONS;
  });

  it('blocks live execution when Phase 2 gate is disabled (T18)', async () => {
    delete process.env.ENABLE_EMAIL_PHASE2_ACTIONS;
    await expect(service.execute(baseInput())).rejects.toThrow(
      /EMAIL_PHASE2_GATE_LOCKED/,
    );
    expect(port.mutate).not.toHaveBeenCalled();
  });

  it('always permits safe simulation without mutating mailboxes (E13)', () => {
    delete process.env.ENABLE_EMAIL_PHASE2_ACTIONS;
    const sim = service.simulate(baseInput({ targetRefs: ['msg-1', 'msg-2'] }));
    expect(sim.mutatedMailbox).toBe(false);
    expect(sim.affectedCount).toBe(2);
    expect(sim.proposedRollbackPlan.reversible).toBe(true);
    expect(sim.blastRadius.blockedTargets).toEqual([]);
    expect(port.mutate).not.toHaveBeenCalled();
  });

  it('blocks self-approval under dual custody (T26)', async () => {
    await expect(
      service.execute(baseInput({ approvedBy: 'analyst-1' })),
    ).rejects.toThrow(/DUAL_CUSTODY_SELF_APPROVAL_BLOCKED/);
  });

  it('requires a fresh approval window (missing or expired is rejected)', async () => {
    await expect(
      service.execute(baseInput({ approvalExpiresAt: null })),
    ).rejects.toThrow(/APPROVAL_EXPIRED/);
    await expect(
      service.execute(
        baseInput({
          approvalExpiresAt: new Date(Date.now() - 1000).toISOString(),
        }),
      ),
    ).rejects.toThrow(/APPROVAL_EXPIRED/);
  });

  it('fails closed on an unknown risk class and on R0 (simulation-only)', async () => {
    await expect(
      service.execute(baseInput({ riskClass: 'LOW' })),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.execute(baseInput({ riskClass: 'R0' })),
    ).rejects.toThrow(/simulation-only/);
  });

  it('R4 needs two distinct approvers, which one approver field cannot satisfy', async () => {
    await expect(
      service.execute(baseInput({ riskClass: 'R4' })),
    ).rejects.toThrow(/dual-key approval/);
  });

  it('is blocked by an active freeze', async () => {
    freezeResult = { frozen: true, reason: 'TENANT freeze active: incident' };
    await expect(service.execute(baseInput())).rejects.toThrow(/ACTION_FROZEN/);
    expect(port.mutate).not.toHaveBeenCalled();
  });

  it('is blocked by blast radius on Tier-0 targets without stepped-up custody', async () => {
    await expect(
      service.execute(
        baseInput({
          riskClass: 'R1',
          targetRefs: ['domain-controller-mailbox'],
        }),
      ),
    ).rejects.toThrow(/BLAST_RADIUS_VIOLATION/);
  });

  it('rejects mass actions above the per-proposal ceiling', async () => {
    const many = Array.from({ length: 51 }, (_, i) => `msg-${i}`);
    await expect(
      service.execute(baseInput({ targetRefs: many })),
    ).rejects.toThrow(/MASS_ACTION_BLOCKED/);
  });

  it('reports VERIFIED only with provider-issued receipts', async () => {
    const res = await service.execute(baseInput({ targetRefs: ['m1', 'm2'] }));
    expect(res.status).toBe('VERIFIED');
    expect(res.outcomes.map((o: any) => o.providerReceiptId)).toEqual([
      'graph-m1',
      'graph-m2',
    ]);
    expect(res.reconciliationRequired).toBe(false);
  });

  it('downgrades a provider success that carries no receipt to UNKNOWN (T28)', async () => {
    (port.mutate as jest.Mock).mockResolvedValueOnce({
      targetRef: 'm1',
      status: 'VERIFIED',
    });
    const res = await service.execute(baseInput({ targetRefs: ['m1'] }));
    expect(res.status).toBe('FAILED');
    expect(res.outcomes[0].status).toBe('UNKNOWN');
    expect(res.reconciliationRequired).toBe(true);
  });

  it('records partial per-message failure without optimistic success (T27 / T28)', async () => {
    (port.mutate as jest.Mock)
      .mockResolvedValueOnce({
        targetRef: 'm1',
        status: 'VERIFIED',
        providerReceiptId: 'r1',
      })
      .mockRejectedValueOnce(new Error('HTTP 503'));
    const res = await service.execute(
      baseInput({
        targetRefs: ['m1', 'm2'],
        requestedAction: 'PULL_BACK_MESSAGE',
      }),
    );
    expect(res.status).toBe('PARTIAL');
    expect(res.reconciliationRequired).toBe(true);
    expect(res.outcomes[0].status).toBe('VERIFIED');
    expect(res.outcomes[1].status).toBe('UNKNOWN');
  });

  it('reports NOT_EXECUTED, never success, when no provider client is bound', async () => {
    const unbound = new EmailActionAdapterService(
      { isFrozen: jest.fn(async () => ({ frozen: false })) } as any,
      new ActionAuthorityService(),
      new BlastRadiusEvaluatorService(),
      new NotConfiguredEmailProviderMutationPort(),
    );
    const res = await unbound.execute(baseInput());
    expect(res.status).toBe('NOT_EXECUTED');
    expect(res.executedAt).toBeNull();
    expect(res.outcomes[0].status).toBe('NOT_EXECUTED');
    await expect(
      new NotConfiguredEmailProviderMutationPort().mutate(),
    ).rejects.toBeInstanceOf(EmailProviderMutationNotConfiguredError);
  });

  it('rollback is a compensation request with no fabricated provider receipt', () => {
    const rb = service.rollback({
      proposalId: 'p',
      tenantId: 't',
      requestedBy: 'u',
      targetRefs: ['m1'],
    });
    expect(rb.status).toBe('COMPENSATION_REQUESTED');
    expect(rb.providerReceipt).toBeNull();
    expect(rb.reconciliationRequired).toBe(true);
  });
});
