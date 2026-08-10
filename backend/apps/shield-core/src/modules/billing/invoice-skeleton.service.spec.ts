import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceSkeletonService } from './invoice-skeleton.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TaxRuleService } from '../tax/tax-rule.service';
import { CommercialKillSwitchService } from '../kill-switch/commercial-kill-switch.service';
import { ConflictException } from '@nestjs/common';

describe('InvoiceSkeletonService (FIN-02 Immutability)', () => {
  let service: InvoiceSkeletonService;
  let prismaMock: any;
  let taxRuleMock: any;
  let killSwitchMock: any;

  beforeEach(async () => {
    prismaMock = {
      commercialInvoice: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      commercialInvoiceLine: { create: jest.fn() },
      commercialCreditNote: { create: jest.fn() },
      commercialDebitNote: { create: jest.fn() },
    };
    taxRuleMock = { resolveTax: jest.fn() };
    killSwitchMock = { assertNotBlocked: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceSkeletonService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: TaxRuleService, useValue: taxRuleMock },
        { provide: CommercialKillSwitchService, useValue: killSwitchMock },
      ],
    }).compile();

    service = module.get<InvoiceSkeletonService>(InvoiceSkeletonService);
  });

  it('should create draft invoice with calculated line items total', async () => {
    prismaMock.commercialInvoice.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'inv-1', ...data }),
    );

    const invoice = await service.createDraftInvoice({
      commercialAccountId: 'comm-1',
      contractId: 'cnt-1',
      lineItems: [
        { sku: 'DEFENSE', amount: 500.0, description: 'Managed Defense' },
        { sku: 'ASSURANCE', amount: 300.0, description: 'Continuous Assurance' },
      ],
    });

    expect(invoice.total_amount).toBe(800.0);
    expect(invoice.status).toBe('DRAFT');
  });

  it('should reject re-issuing an invoice past DRAFT status', async () => {
    prismaMock.commercialInvoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      status: 'ISSUED',
      commercialAccount: { billing_classification: 'COMMERCIAL_DIRECT' },
    });

    await expect(service.issueInvoice('inv-1')).rejects.toThrow(ConflictException);
  });

  it('COM-03: refuses to issue a live invoice for a non-commercial account (DEMO/SANDBOX/INTERNAL/PILOT/EVALUATION)', async () => {
    prismaMock.commercialInvoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      status: 'DRAFT',
      commercial_account_id: 'acct-1',
      commercialAccount: { billing_classification: 'DEMO' },
    });

    await expect(service.issueInvoice('inv-1')).rejects.toThrow(ConflictException);
    expect(prismaMock.commercialInvoice.update).not.toHaveBeenCalled();
  });

  it('fails closed adding an invoice line with no approved tax rule (Part 10)', async () => {
    prismaMock.commercialInvoice.findUnique.mockResolvedValue({ id: 'inv-1', status: 'DRAFT', currency: 'USD' });
    taxRuleMock.resolveTax.mockResolvedValue(null);

    await expect(
      service.addInvoiceLine('inv-1', {
        sku: 'DEFENSE',
        contractId: 'cnt-1',
        servicePeriodStart: new Date(),
        servicePeriodEnd: new Date(),
        quantity: 1,
        unitPrice: 100,
        jurisdiction: 'US-CA',
        productTaxClass: 'SAAS',
      }),
    ).rejects.toThrow(ConflictException);
    expect(prismaMock.commercialInvoiceLine.create).not.toHaveBeenCalled();
  });

  it('adds a line with tax resolved and frozen when a rule is approved', async () => {
    prismaMock.commercialInvoice.findUnique.mockResolvedValue({ id: 'inv-1', status: 'DRAFT', currency: 'USD' });
    taxRuleMock.resolveTax.mockResolvedValue({ ruleId: 'rule-1', ratePercent: 8.5, reverseCharge: false, taxAmount: 8.5 });
    prismaMock.commercialInvoiceLine.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'line-1', ...data }));

    const line = await service.addInvoiceLine('inv-1', {
      sku: 'DEFENSE',
      contractId: 'cnt-1',
      servicePeriodStart: new Date(),
      servicePeriodEnd: new Date(),
      quantity: 1,
      unitPrice: 100,
      jurisdiction: 'US-CA',
      productTaxClass: 'SAAS',
    });

    expect(line.tax_rule_id).toBe('rule-1');
    expect(line.tax_amount).toBe(8.5);
  });

  it('blocks issuing an invoice that has a line with unresolved tax', async () => {
    prismaMock.commercialInvoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      status: 'DRAFT',
      commercialAccount: { billing_classification: 'COMMERCIAL_DIRECT' },
      lines: [{ id: 'line-1', tax_rule_id: null }],
    });

    await expect(service.issueInvoice('inv-1')).rejects.toThrow(ConflictException);
  });

  it('never mutates an issued invoice — corrections go through append-only credit notes', async () => {
    prismaMock.commercialInvoice.findUnique.mockResolvedValue({ id: 'inv-1', status: 'ISSUED', currency: 'USD' });
    prismaMock.commercialCreditNote.create.mockResolvedValue({ id: 'cn-1', status: 'ISSUED', amount: 50 });

    const note = await service.issueCreditNote('inv-1', 50, 'billing correction');

    expect(note.id).toBe('cn-1');
    expect(prismaMock.commercialInvoice.update).not.toHaveBeenCalled();
  });

  it('rejects issuing a credit note against a non-ISSUED invoice', async () => {
    prismaMock.commercialInvoice.findUnique.mockResolvedValue({ id: 'inv-1', status: 'DRAFT' });

    await expect(service.issueCreditNote('inv-1', 50, 'x')).rejects.toThrow(ConflictException);
  });

  it('OPS-01: refuses to finalize an invoice while the kill switch blocks INVOICE_FINALIZATION', async () => {
    killSwitchMock.assertNotBlocked.mockRejectedValue(new ConflictException('blocked'));

    await expect(service.issueInvoice('inv-1')).rejects.toThrow(ConflictException);
    expect(prismaMock.commercialInvoice.findUnique).not.toHaveBeenCalled();
  });

  it('OPS-01: refuses to add an invoice line while the kill switch blocks USAGE_BILLING_EXPORT', async () => {
    killSwitchMock.assertNotBlocked.mockRejectedValue(new ConflictException('blocked'));

    await expect(
      service.addInvoiceLine('inv-1', {
        sku: 'DEFENSE',
        contractId: 'cnt-1',
        servicePeriodStart: new Date(),
        servicePeriodEnd: new Date(),
        quantity: 1,
        unitPrice: 100,
        jurisdiction: 'US-CA',
        productTaxClass: 'SAAS',
      }),
    ).rejects.toThrow(ConflictException);
    expect(prismaMock.commercialInvoiceLine.create).not.toHaveBeenCalled();
  });
});
