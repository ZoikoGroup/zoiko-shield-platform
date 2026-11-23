import { ForbiddenException } from '@nestjs/common';
import { EmailActionAdapterService } from './email-action-adapter.service';

describe('EmailActionAdapterService (T18, T26, T27, T28, E13)', () => {
  const service = new EmailActionAdapterService();

  it('blocks live execution when Phase 2 gate is disabled (T18)', async () => {
    await expect(
      service.execute({
        proposalId: 'prop-1',
        tenantId: 'tenant-1',
        provider: 'MICROSOFT_365',
        requestedAction: 'QUARANTINE_MESSAGE',
        targetRefs: ['msg-1'],
        consentScope: 'Mail.ReadWrite',
        riskClass: 'R3',
        initiatedBy: 'analyst-1',
        approvedBy: 'lead-1',
        hasDedicatedWriteCredential: true,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('always permits safe simulation without mutating mailboxes (E13)', () => {
    const sim = service.simulate({
      proposalId: 'prop-1',
      tenantId: 'tenant-1',
      provider: 'MICROSOFT_365',
      requestedAction: 'QUARANTINE_MESSAGE',
      targetRefs: ['msg-1', 'msg-2'],
      consentScope: 'email:action:propose',
      riskClass: 'R3',
      initiatedBy: 'analyst-1',
    });

    expect(sim.mutatedMailbox).toBe(false);
    expect(sim.affectedCount).toBe(2);
    expect(sim.proposedRollbackPlan.reversible).toBe(true);
  });

  it('blocks self-approval under dual custody (T26)', async () => {
    await expect(
      service.execute(
        {
          proposalId: 'prop-2',
          tenantId: 'tenant-1',
          provider: 'MICROSOFT_365',
          requestedAction: 'QUARANTINE_MESSAGE',
          targetRefs: ['msg-1'],
          consentScope: 'Mail.ReadWrite',
          riskClass: 'R3',
          initiatedBy: 'analyst-1',
          approvedBy: 'analyst-1',
          hasDedicatedWriteCredential: true,
        },
        { phase2OverrideForTest: true },
      ),
    ).rejects.toThrow(/DUAL_CUSTODY_SELF_APPROVAL_BLOCKED/);
  });

  it('records partial per-message failure without optimistic success (T27 / T28)', async () => {
    const partial = await service.execute(
      {
        proposalId: 'prop-3',
        tenantId: 'tenant-1',
        provider: 'MICROSOFT_365',
        requestedAction: 'PULL_BACK_MESSAGE',
        targetRefs: ['msg-1', 'msg-2'],
        consentScope: 'Mail.ReadWrite',
        riskClass: 'R3',
        initiatedBy: 'analyst-1',
        approvedBy: 'commander-2',
        hasDedicatedWriteCredential: true,
        simulatePartialFailureIndex: 1,
      },
      { phase2OverrideForTest: true },
    );

    expect(partial.status).toBe('PARTIAL');
    expect(partial.reconciliationRequired).toBe(true);
    expect(partial.outcomes[0].status).toBe('VERIFIED');
    expect(partial.outcomes[1].status).toBe('FAILED');
  });
});
