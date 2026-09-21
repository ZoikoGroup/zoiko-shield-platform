import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { InvoiceSkeletonService } from './invoice-skeleton.service';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';

describe('BillingController', () => {
  let controller: BillingController;
  let mockInvoiceService: Partial<InvoiceSkeletonService>;

  beforeEach(async () => {
    mockInvoiceService = {
      createDraftInvoice: jest.fn().mockImplementation((dto) =>
        Promise.resolve({
          id: 'inv-draft-001',
          commercialAccountId: dto.commercialAccountId,
          contractId: dto.contractId,
          currency: dto.currency || 'USD',
          status: 'DRAFT',
          totalAmount: 5000,
        }),
      ),
      addInvoiceLine: jest.fn().mockImplementation((id, dto) =>
        Promise.resolve({
          id: 'inv-line-001',
          invoiceId: id,
          sku: dto.sku,
          quantity: dto.quantity,
          unitPrice: dto.unitPrice,
          taxAmount: 100,
        }),
      ),
      recordFxRate: jest.fn().mockImplementation((id, dto) =>
        Promise.resolve({
          id,
          fxRate: dto.fxRate ?? dto.rate,
          fxSource: dto.fxSource ?? dto.source,
          updatedAt: new Date(),
        }),
      ),
      issueCreditNote: jest.fn().mockImplementation((id, amount, reason) =>
        Promise.resolve({
          id: 'note-credit-001',
          invoiceId: id,
          type: 'CREDIT',
          amount,
          reason,
        }),
      ),
      issueDebitNote: jest.fn().mockImplementation((id, amount, reason) =>
        Promise.resolve({
          id: 'note-debit-001',
          invoiceId: id,
          type: 'DEBIT',
          amount,
          reason,
        }),
      ),
      issueInvoice: jest.fn().mockImplementation((id) =>
        Promise.resolve({
          id,
          status: 'ISSUED',
          issuedAt: new Date(),
          locked: true,
        }),
      ),
      getInvoicesByAccount: jest.fn().mockImplementation((accountId) =>
        Promise.resolve([
          { id: 'inv-001', commercialAccountId: accountId, status: 'ISSUED' },
          { id: 'inv-002', commercialAccountId: accountId, status: 'DRAFT' },
        ]),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [
        {
          provide: InvoiceSkeletonService,
          useValue: mockInvoiceService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BillingController>(BillingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should create draft invoice with 201 status', async () => {
    const res = await controller.createDraftInvoice({
      commercialAccountId: 'acct-123',
      contractId: 'contract-456',
      currency: 'USD',
      lineItems: [
        { sku: 'SKU-SHIELD-SOC2', amount: 5000, description: 'SOC 2 Core' },
      ],
    });
    expect(res.statusCode).toBe(HttpStatus.CREATED);
    expect(res.data.id).toBe('inv-draft-001');
    expect(mockInvoiceService.createDraftInvoice).toHaveBeenCalled();
  });

  it('should add structured invoice line', async () => {
    const res = await controller.addInvoiceLine('inv-draft-001', {
      sku: 'SKU-SHIELD-ENTERPRISE',
      contractId: 'contract-456',
      orderLineId: 'order-789',
      servicePeriodStart: new Date(),
      servicePeriodEnd: new Date(),
      quantity: 1,
      unitPrice: 15000,
      jurisdiction: 'US-NY',
      productTaxClass: 'SAAS_STANDARD',
      basisSources: [
        {
          basisType: 'ENTITLEMENT',
          sourceId: '11111111-1111-4000-8000-000000000001',
        },
      ],
    });
    expect(res.statusCode).toBe(HttpStatus.CREATED);
    expect((res.data as any).sku).toBe('SKU-SHIELD-ENTERPRISE');
  });

  it('should record currency FX rate prior to issue', async () => {
    const res = await controller.recordFxRate('inv-draft-001', {
      fxRate: 1.085,
      fxSource: 'ECB_DAILY_FIX',
    });
    expect(res.statusCode).toBe(HttpStatus.OK);
    expect((res.data as any).fxRate).toBe(1.085);
  });

  it('should issue credit note against an invoice', async () => {
    const res = await controller.issueCreditNote('inv-001', {
      amount: 250,
      reason: 'SLA Breach Tier-1 Service Credit',
    });
    expect(res.statusCode).toBe(HttpStatus.CREATED);
    expect((res.data as any).amount).toBe(250);
  });

  it('should finalize and lock an issued invoice', async () => {
    const res = await controller.issueInvoice('inv-draft-001');
    expect(res.statusCode).toBe(HttpStatus.OK);
    expect((res.data as any).status).toBe('ISSUED');
  });

  it('should query invoices by commercial account ID', async () => {
    const res = await controller.getInvoices('acct-123');
    expect(res.statusCode).toBe(HttpStatus.OK);
    expect(res.data).toHaveLength(2);
  });
});
