import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ReconciliationService (ZS-COM-BILL-001 REC-01: unknown never silently becomes settled/entitled)', () => {
  let service: ReconciliationService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      reconciliationRun: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      reconciliationIssue: {
        create: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      contract: { findMany: jest.fn() },
      entitlement: { findFirst: jest.fn(), findMany: jest.fn() },
      commercialInvoice: { findMany: jest.fn() },
      serviceObligation: { findMany: jest.fn() },
      slaMeasurement: { findMany: jest.fn() },
      partnerSettlement: { findMany: jest.fn() },
      partnerAgreement: { findFirst: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReconciliationService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<ReconciliationService>(ReconciliationService);
  });

  it('files an issue for an ACTIVE contract with no matching ACTIVE entitlement, rather than assuming it is fine', async () => {
    prismaMock.contract.findMany.mockResolvedValue([
      { id: 'c-1', commercial_account_id: 'acct-1', status: 'ACTIVE' },
    ]);
    prismaMock.entitlement.findFirst.mockResolvedValue(null);
    prismaMock.reconciliationIssue.create.mockResolvedValue({ id: 'issue-1' });

    const result = await service.reconcileContractEntitlement('run-1');

    expect(result.issuesFound).toBe(1);
    expect(prismaMock.reconciliationIssue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ domain: 'CONTRACT_ENTITLEMENT' }),
      }),
    );
  });

  it('does not file an issue when the contract has a matching ACTIVE entitlement', async () => {
    prismaMock.contract.findMany.mockResolvedValue([
      { id: 'c-1', commercial_account_id: 'acct-1', status: 'ACTIVE' },
    ]);
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
      expect.objectContaining({
        data: expect.objectContaining({
          domain: 'BILLING_PAYMENT',
          expected_value: '500',
        }),
      }),
    );
  });

  it('does not flag an invoice that has received no payments yet (unpaid is not a mismatch)', async () => {
    prismaMock.commercialInvoice.findMany.mockResolvedValue([
      { id: 'inv-1', total_amount: 500, payments: [] },
    ]);

    const result = await service.reconcileInvoicePayments('run-1');

    expect(result.issuesFound).toBe(0);
  });

  it('rejects resolving an issue that is not OPEN', async () => {
    prismaMock.reconciliationIssue.findUnique.mockResolvedValue({
      id: 'issue-1',
      status: 'RESOLVED',
    });

    await expect(service.resolveIssue('issue-1', 'x')).rejects.toThrow(
      ConflictException,
    );
  });

  it('files an issue for a service obligation past due_at that is neither DELIVERED nor WAIVED', async () => {
    prismaMock.serviceObligation.findMany.mockResolvedValue([
      { id: 'ob-1', obligation_type: 'IR_RETAINER', status: 'SCHEDULED' },
    ]);
    prismaMock.reconciliationIssue.create.mockResolvedValue({ id: 'issue-1' });

    const result = await service.reconcileServiceObligations('run-1');

    expect(result.issuesFound).toBe(1);
    expect(prismaMock.reconciliationIssue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ domain: 'SERVICE_OBLIGATION' }),
      }),
    );
  });

  it('files an issue for a breached SLA measurement with no service credit ever proposed against it', async () => {
    prismaMock.slaMeasurement.findMany.mockResolvedValue([
      { id: 'm-1', breached: true, serviceCredits: [] },
    ]);
    prismaMock.reconciliationIssue.create.mockResolvedValue({ id: 'issue-1' });

    const result = await service.reconcileServiceCredits('run-1');

    expect(result.issuesFound).toBe(1);
    expect(prismaMock.reconciliationIssue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ domain: 'SERVICE_CREDIT' }),
      }),
    );
  });

  it('does not flag a breach that already has a proposed credit', async () => {
    prismaMock.slaMeasurement.findMany.mockResolvedValue([
      { id: 'm-1', breached: true, serviceCredits: [{ id: 'credit-1' }] },
    ]);

    const result = await service.reconcileServiceCredits('run-1');

    expect(result.issuesFound).toBe(0);
  });

  it('files an issue when a partner settlement commission does not match agreement rate * gross', async () => {
    prismaMock.partnerSettlement.findMany.mockResolvedValue([
      {
        id: 's-1',
        partner_id: 'p-1',
        gross_amount: 1000,
        commission_amount: 999,
      },
    ]);
    prismaMock.partnerAgreement.findFirst.mockResolvedValue({
      commission_percent: 10,
    });
    prismaMock.reconciliationIssue.create.mockResolvedValue({ id: 'issue-1' });

    const result = await service.reconcilePartnerCosts('run-1');

    expect(result.issuesFound).toBe(1);
    expect(prismaMock.reconciliationIssue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          domain: 'PARTNER_COST',
          expected_value: '100',
        }),
      }),
    );
  });

  it('does not flag a partner settlement whose commission correctly matches the agreement rate', async () => {
    prismaMock.partnerSettlement.findMany.mockResolvedValue([
      {
        id: 's-1',
        partner_id: 'p-1',
        gross_amount: 1000,
        commission_amount: 100,
      },
    ]);
    prismaMock.partnerAgreement.findFirst.mockResolvedValue({
      commission_percent: 10,
    });

    const result = await service.reconcilePartnerCosts('run-1');

    expect(result.issuesFound).toBe(0);
  });

  it('files an issue when an ACTIVE entitlement backs a SUSPENDED/TERMINATED commercial account (silent claim degradation)', async () => {
    prismaMock.entitlement.findMany.mockResolvedValue([
      { id: 'ent-1', commercialAccount: { status: 'SUSPENDED' } },
    ]);
    prismaMock.reconciliationIssue.create.mockResolvedValue({ id: 'issue-1' });

    const result = await service.reconcileClaimEligibility('run-1');

    expect(result.issuesFound).toBe(1);
    expect(prismaMock.reconciliationIssue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ domain: 'CLAIM_ELIGIBILITY' }),
      }),
    );
  });

  it('does not flag an ACTIVE entitlement backed by an ACTIVE commercial account', async () => {
    prismaMock.entitlement.findMany.mockResolvedValue([
      { id: 'ent-1', commercialAccount: { status: 'ACTIVE' } },
    ]);

    const result = await service.reconcileClaimEligibility('run-1');

    expect(result.issuesFound).toBe(0);
  });
});
