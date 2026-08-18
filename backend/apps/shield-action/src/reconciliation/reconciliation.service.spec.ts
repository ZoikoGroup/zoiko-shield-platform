import { ReconciliationService } from './reconciliation.service';

function makePrisma(receipt: any) {
  return {
    actionReceipt: { findUnique: jest.fn().mockResolvedValue(receipt) },
    actionReconciliation: { create: jest.fn().mockResolvedValue({}) },
  } as any;
}

describe('ReconciliationService', () => {
  it('records VERIFIED for a SIMULATED receipt', async () => {
    const prisma = makePrisma({
      tenant_id: 't1',
      status: 'SIMULATED',
      observed_state: '{}',
    });
    const service = new ReconciliationService(prisma);
    const result = await service.reconcile('cmd1', 'rcpt1');
    expect(result.result).toBe('VERIFIED');
  });

  it('never upgrades a missing/indeterminate receipt to VERIFIED — stays UNKNOWN', async () => {
    const prisma = makePrisma(undefined);
    const service = new ReconciliationService(prisma);
    const result = await service.reconcile('cmd1', 'rcpt1');
    expect(result.result).toBe('UNKNOWN');
  });

  it('stays UNKNOWN for any non-SIMULATED status', async () => {
    const prisma = makePrisma({
      tenant_id: 't1',
      status: 'FAILED',
      observed_state: '{}',
    });
    const service = new ReconciliationService(prisma);
    const result = await service.reconcile('cmd1', 'rcpt1');
    expect(result.result).toBe('UNKNOWN');
  });
});
