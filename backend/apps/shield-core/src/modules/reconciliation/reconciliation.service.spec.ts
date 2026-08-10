import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ReconciliationService (ZS-COM-BILL-001 REC-01: unknown never silently becomes settled/entitled)', () => {
  let service: ReconciliationService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      reconciliationRun: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
      reconciliationIssue: { create: jest.fn(), count: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      contract: { findMany: jest.fn() },
      entitlement: { findFirst: jest.fn() },
      commercialInvoice: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ReconciliationService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get<ReconciliationService>(ReconciliationService);
  });

  it('files an issue for an ACTIVE contract with no matching ACTIVE entitlement, rather than assuming it is fine', async () => {
    prismaMock.contract.findMany.mockResolvedValue([{ id: 'c-1', commercial_account_id: 'acct-1', status: 'ACTIVE' }]);
    prismaMock.entitlement.findFirst.mockResolvedValue(null);
    prismaMock.reconciliationIssue.create.mockResolvedValue({ id: 'issue-1' });

    const result = await service.reconcileContractEntitlement('run-1');

    expect(result.issuesFound).toBe(1);
    expect(prismaMock.reconciliationIssue.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ domain: 'CONTRACT_ENTITLEMENT' }) }),
    );
  });

  it('does not file an issue when the contract has a matching ACTIVE entitlement', async () => {
    prismaMock.contract.findMany.mockResolvedValue([{ id: 'c-1', commercial_account_id: 'acct-1', status: 'ACTIVE' }]);
    prismaMock.entitlement.findFirst.mockResolvedValue({ id: 'ent-1' });

    const result = await service.reconcileContractEntitlement('run-1');

    expect(result.issuesFound).toBe(0);
    expect(prismaMock.reconciliationIssue.create).not.toHaveBeenCalled();
  });

  it('an invoice/payment mismatch is filed as an issue, never silently corrected on the invoice or payment itself', async () => {
    prismaMock.commercialInvoice.findMany.mockResolvedValue([
      {
        id: 'inv-1',
        total_amount: 500,
        payments: [{ status: 'SETTLED', amount: 300, refunds: [] }],
      },
    ]);
    prismaMock.reconciliationIssue.create.mockResolvedValue({ id: 'issue-1' });

    const result = await service.reconcileInvoicePayments('run-1');

    expect(result.issuesFound).toBe(1);
    expect(prismaMock.reconciliationIssue.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ domain: 'BILLING_PAYMENT', expected_value: '500' }) }),
    );
  });

  it('does not flag an invoice that has received no payments yet (unpaid is not a mismatch)', async () => {
    prismaMock.commercialInvoice.findMany.mockResolvedValue([{ id: 'inv-1', total_amount: 500, payments: [] }]);

    const result = await service.reconcileInvoicePayments('run-1');

    expect(result.issuesFound).toBe(0);
  });

  it('rejects resolving an issue that is not OPEN', async () => {
    prismaMock.reconciliationIssue.findUnique.mockResolvedValue({ id: 'issue-1', status: 'RESOLVED' });

    await expect(service.resolveIssue('issue-1', 'x')).rejects.toThrow(ConflictException);
  });
});
