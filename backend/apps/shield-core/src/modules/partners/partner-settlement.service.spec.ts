import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { PartnerSettlementService } from './partner-settlement.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PartnerService } from './partner.service';

describe('PartnerSettlementService (ZS-COM-BILL-001 Part 21: commission never invented)', () => {
  let service: PartnerSettlementService;
  let prismaMock: any;
  let partnerMock: any;

  beforeEach(async () => {
    prismaMock = {
      partnerDelegation: { findMany: jest.fn() },
      commercialInvoice: { findMany: jest.fn() },
      partnerSettlement: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    };
    partnerMock = { getActiveAgreement: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PartnerSettlementService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PartnerService, useValue: partnerMock },
      ],
    }).compile();

    service = module.get<PartnerSettlementService>(PartnerSettlementService);
  });

  it('fails closed with no approved partner agreement', async () => {
    partnerMock.getActiveAgreement.mockResolvedValue(null);

    await expect(
      service.calculateSettlement({ partnerId: 'p-1', periodStart: new Date(), periodEnd: new Date() }),
    ).rejects.toThrow(ConflictException);
    expect(prismaMock.partnerSettlement.create).not.toHaveBeenCalled();
  });

  it('computes commission from the approved agreement rate applied to delegated-account gross revenue only', async () => {
    partnerMock.getActiveAgreement.mockResolvedValue({ commission_percent: 10 });
    prismaMock.partnerDelegation.findMany.mockResolvedValue([
      { commercial_account_id: 'acct-1' },
      { commercial_account_id: 'acct-2' },
    ]);
    prismaMock.commercialInvoice.findMany.mockResolvedValue([
      { total_amount: 1000 },
      { total_amount: 500 },
    ]);
    prismaMock.partnerSettlement.create.mockImplementation(({ data }: any) => Promise.resolve(data));

    const settlement = await service.calculateSettlement({
      partnerId: 'p-1',
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-01-31'),
    });

    expect(settlement.gross_amount).toBe(1500);
    expect(settlement.commission_amount).toBe(150);
    expect(prismaMock.commercialInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ commercial_account_id: { in: ['acct-1', 'acct-2'] }, status: 'ISSUED' }),
      }),
    );
  });

  it('only counts ISSUED invoices for accounts actually delegated to this partner, never partner-reported figures', async () => {
    partnerMock.getActiveAgreement.mockResolvedValue({ commission_percent: 20 });
    prismaMock.partnerDelegation.findMany.mockResolvedValue([]);
    prismaMock.commercialInvoice.findMany.mockResolvedValue([]);
    prismaMock.partnerSettlement.create.mockImplementation(({ data }: any) => Promise.resolve(data));

    const settlement = await service.calculateSettlement({
      partnerId: 'p-1',
      periodStart: new Date(),
      periodEnd: new Date(),
    });

    expect(settlement.gross_amount).toBe(0);
    expect(settlement.commission_amount).toBe(0);
  });

  it('rejects marking a DRAFT settlement paid without approval first', async () => {
    prismaMock.partnerSettlement.findUnique.mockResolvedValue({ id: 's-1', status: 'DRAFT' });

    await expect(service.markPaid('s-1')).rejects.toThrow(ConflictException);
  });

  it('allows the DRAFT -> APPROVED -> PAID path', async () => {
    prismaMock.partnerSettlement.findUnique.mockResolvedValueOnce({ id: 's-1', status: 'DRAFT' });
    prismaMock.partnerSettlement.update.mockResolvedValueOnce({ id: 's-1', status: 'APPROVED' });
    await service.approveSettlement('s-1');

    prismaMock.partnerSettlement.findUnique.mockResolvedValueOnce({ id: 's-1', status: 'APPROVED' });
    prismaMock.partnerSettlement.update.mockResolvedValueOnce({ id: 's-1', status: 'PAID' });
    const paid = await service.markPaid('s-1');

    expect(paid.status).toBe('PAID');
  });
});
