import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { QuoteService } from './quote.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';
import { CommercialKillSwitchService } from '../kill-switch/commercial-kill-switch.service';

describe('QuoteService (ZS-COM-BILL-001 Part 2 CPQ chain)', () => {
  let service: QuoteService;
  let prismaMock: any;
  let catalogMock: any;
  let approvalMock: any;
  let killSwitchMock: any;

  beforeEach(async () => {
    prismaMock = {
      commercialAccount: { findUnique: jest.fn() },
      catalogVersion: { findUnique: jest.fn() },
      commercialQuote: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    };
    catalogMock = { getActivePriceBook: jest.fn() };
    approvalMock = { requestApproval: jest.fn(), getApprovalById: jest.fn(), markApplied: jest.fn() };
    killSwitchMock = { assertNotBlocked: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuoteService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CatalogService, useValue: catalogMock },
        { provide: CommercialApprovalService, useValue: approvalMock },
        { provide: CommercialKillSwitchService, useValue: killSwitchMock },
      ],
    }).compile();

    service = module.get<QuoteService>(QuoteService);
  });

  const readyAccount = {
    id: 'acct-1',
    billing_classification: 'COMMERCIAL_DIRECT',
    legal_entity_id: 'le-1',
    region: 'US',
    billing_source: 'DIRECT',
  };

  it('fails closed when no approved price book exists for a SKU (draft price cannot be used)', async () => {
    prismaMock.commercialAccount.findUnique.mockResolvedValue(readyAccount);
    prismaMock.catalogVersion.findUnique.mockResolvedValue({ id: 'cv-1', status: 'APPROVED' });
    catalogMock.getActivePriceBook.mockResolvedValue(null);

    await expect(
      service.createQuote({
        commercialAccountId: 'acct-1',
        catalogVersionId: 'cv-1',
        requestedBy: 'alice',
        lines: [{ sku: 'SKU-1', quantity: 1 }],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('fails closed when the commercial account is missing production-readiness fields', async () => {
    prismaMock.commercialAccount.findUnique.mockResolvedValue({
      id: 'acct-2',
      billing_classification: 'COMMERCIAL_DIRECT',
      legal_entity_id: null,
      region: null,
      billing_source: null,
    });

    await expect(
      service.createQuote({
        commercialAccountId: 'acct-2',
        catalogVersionId: 'cv-1',
        requestedBy: 'alice',
        lines: [{ sku: 'SKU-1', quantity: 1 }],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('allows a DEMO account through without production-readiness fields', async () => {
    prismaMock.commercialAccount.findUnique.mockResolvedValue({
      id: 'acct-3',
      billing_classification: 'DEMO',
      legal_entity_id: null,
      region: null,
      billing_source: null,
    });
    prismaMock.catalogVersion.findUnique.mockResolvedValue({ id: 'cv-1', status: 'APPROVED' });
    catalogMock.getActivePriceBook.mockResolvedValue({
      id: 'pb-1',
      product_id: 'prod-1',
      unit_price: 10,
    });
    prismaMock.commercialQuote.create.mockResolvedValue({ id: 'q-1', status: 'DRAFT' });

    const quote = await service.createQuote({
      commercialAccountId: 'acct-3',
      catalogVersionId: 'cv-1',
      requestedBy: 'alice',
      lines: [{ sku: 'SKU-1', quantity: 1 }],
    });

    expect(quote.id).toBe('q-1');
  });

  it('marks requires_approval when any line carries a discount, and routes through the maker-checker engine', async () => {
    prismaMock.commercialAccount.findUnique.mockResolvedValue(readyAccount);
    prismaMock.catalogVersion.findUnique.mockResolvedValue({ id: 'cv-1', status: 'APPROVED' });
    catalogMock.getActivePriceBook.mockResolvedValue({
      id: 'pb-1',
      product_id: 'prod-1',
      unit_price: 10,
    });
    prismaMock.commercialQuote.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'q-1', status: 'DRAFT', requires_approval: data.requires_approval, snapshot: data.snapshot }),
    );

    const quote = await service.createQuote({
      commercialAccountId: 'acct-1',
      catalogVersionId: 'cv-1',
      requestedBy: 'alice',
      lines: [{ sku: 'SKU-1', quantity: 1, discountPercent: 15 }],
    });

    expect(quote.requires_approval).toBe(true);

    prismaMock.commercialQuote.findUnique.mockResolvedValue({ ...quote, status: 'DRAFT' });
    approvalMock.requestApproval.mockResolvedValue({ id: 'appr-1', status: 'PENDING_APPROVAL' });
    prismaMock.commercialQuote.update.mockResolvedValue({ ...quote, status: 'PENDING_APPROVAL', approval_id: 'appr-1' });

    await service.submitForApproval('q-1', 'alice');
    expect(approvalMock.requestApproval).toHaveBeenCalled();
  });

  it('blocks approving a quote that requires approval until the linked CommercialApproval is APPROVED', async () => {
    prismaMock.commercialQuote.findUnique.mockResolvedValue({
      id: 'q-1',
      status: 'PENDING_APPROVAL',
      requires_approval: true,
      approval_id: 'appr-1',
    });
    approvalMock.getApprovalById.mockResolvedValue({ id: 'appr-1', status: 'PENDING_APPROVAL' });

    await expect(service.approveQuote('q-1', 'bob')).rejects.toThrow(ConflictException);
  });

  it('dynamically expires a quote past expires_at on read, before a sweeper ever runs, so approval fails', async () => {
    const pastExpiry = new Date(Date.now() - 1000);
    prismaMock.commercialQuote.findUnique.mockResolvedValue({
      id: 'q-1',
      status: 'APPROVED',
      expires_at: pastExpiry,
      requires_approval: false,
    });
    prismaMock.commercialQuote.update.mockResolvedValue({
      id: 'q-1',
      status: 'EXPIRED',
      expires_at: pastExpiry,
    });

    await expect(service.approveQuote('q-1', 'bob')).rejects.toThrow(ConflictException);
    expect(prismaMock.commercialQuote.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'EXPIRED' } }),
    );
  });

  it('does not touch a quote whose expires_at has not yet passed', async () => {
    const future = new Date(Date.now() + 1000 * 60 * 60);
    prismaMock.commercialQuote.findUnique.mockResolvedValue({
      id: 'q-1',
      status: 'APPROVED',
      expires_at: future,
    });

    const quote = await service.getQuoteById('q-1');

    expect(quote.status).toBe('APPROVED');
    expect(prismaMock.commercialQuote.update).not.toHaveBeenCalled();
  });

  it('OPS-01: refuses to approve a quote while the commercial kill switch blocks QUOTE_APPROVAL', async () => {
    killSwitchMock.assertNotBlocked.mockRejectedValue(new ConflictException('blocked'));

    await expect(service.approveQuote('q-1', 'bob')).rejects.toThrow(ConflictException);
    expect(prismaMock.commercialQuote.findUnique).not.toHaveBeenCalled();
  });
});
