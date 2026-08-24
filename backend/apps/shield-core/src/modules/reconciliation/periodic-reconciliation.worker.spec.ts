import { Test, TestingModule } from '@nestjs/testing';
import { PeriodicReconciliationWorker } from './periodic-reconciliation.worker';
import { ReconciliationService } from './reconciliation.service';

describe('PeriodicReconciliationWorker (ZS-COM-BILL-001 REC-01 Scheduled Engine)', () => {
  let worker: PeriodicReconciliationWorker;
  let reconciliationServiceMock: any;

  beforeEach(async () => {
    reconciliationServiceMock = {
      startRun: jest.fn().mockResolvedValue({ id: 'rec-run-001' }),
      reconcileContractEntitlement: jest.fn().mockResolvedValue({ checked: 5, issuesFound: 1 }),
      reconcileInvoicePayments: jest.fn().mockResolvedValue({ checked: 10, issuesFound: 0 }),
      reconcileServiceObligations: jest.fn().mockResolvedValue({ checked: 8, issuesFound: 2 }),
      reconcileServiceCredits: jest.fn().mockResolvedValue({ checked: 2, issuesFound: 0 }),
      reconcilePartnerCosts: jest.fn().mockResolvedValue({ checked: 4, issuesFound: 0 }),
      reconcileClaimEligibility: jest.fn().mockResolvedValue({ checked: 6, issuesFound: 1 }),
      completeRun: jest.fn().mockResolvedValue({ id: 'rec-run-001', status: 'COMPLETED' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PeriodicReconciliationWorker,
        { provide: ReconciliationService, useValue: reconciliationServiceMock },
      ],
    }).compile();

    worker = module.get<PeriodicReconciliationWorker>(PeriodicReconciliationWorker);
  });

  it('executes all 6 domain reconciliation checks and returns aggregated issue count', async () => {
    const result = await worker.handleDailyReconciliation();

    expect(result.status).toBe('COMPLETED');
    expect(result.runId).toBe('rec-run-001');
    expect(result.totalIssuesFound).toBe(4); // 1 + 0 + 2 + 0 + 0 + 1

    expect(reconciliationServiceMock.startRun).toHaveBeenCalledWith('DAILY_SCHEDULED');
    expect(reconciliationServiceMock.reconcileContractEntitlement).toHaveBeenCalledWith('rec-run-001');
    expect(reconciliationServiceMock.reconcileInvoicePayments).toHaveBeenCalledWith('rec-run-001');
    expect(reconciliationServiceMock.reconcileServiceObligations).toHaveBeenCalledWith('rec-run-001');
    expect(reconciliationServiceMock.reconcileServiceCredits).toHaveBeenCalledWith('rec-run-001');
    expect(reconciliationServiceMock.reconcilePartnerCosts).toHaveBeenCalledWith('rec-run-001');
    expect(reconciliationServiceMock.reconcileClaimEligibility).toHaveBeenCalledWith('rec-run-001');
    expect(reconciliationServiceMock.completeRun).toHaveBeenCalledWith('rec-run-001');
  });

  it('supports on-demand manual triggering of the reconciliation flow', async () => {
    const result = await worker.triggerManualRun('OPERATOR_INVOKED');
    expect(result.status).toBe('COMPLETED');
    expect(result.runId).toBe('rec-run-001');
  });
});
