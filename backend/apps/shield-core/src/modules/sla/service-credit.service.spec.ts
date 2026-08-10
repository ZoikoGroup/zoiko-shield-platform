import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { ServiceCreditService } from './service-credit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SlaMeasurementService } from './sla-measurement.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';
import { InvoiceSkeletonService } from '../billing/invoice-skeleton.service';

describe('ServiceCreditService (ZS-COM-BILL-001 FIN-04)', () => {
  let service: ServiceCreditService;
  let prismaMock: any;
  let measurementMock: any;
  let approvalMock: any;
  let invoiceMock: any;

  beforeEach(async () => {
    prismaMock = {
      serviceCredit: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    };
    measurementMock = { getMeasurementById: jest.fn() };
    approvalMock = { requestApproval: jest.fn(), decideApproval: jest.fn() };
    invoiceMock = { issueCreditNote: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceCreditService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: SlaMeasurementService, useValue: measurementMock },
        { provide: CommercialApprovalService, useValue: approvalMock },
        { provide: InvoiceSkeletonService, useValue: invoiceMock },
      ],
    }).compile();

    service = module.get<ServiceCreditService>(ServiceCreditService);
  });

  it('refuses to propose a credit against a non-breached measurement', async () => {
    measurementMock.getMeasurementById.mockResolvedValue({ id: 'm-1', breached: false, contract_id: 'c-1' });

    await expect(
      service.proposeCredit({ slaMeasurementId: 'm-1', amount: 100, proposedBy: 'ops' }),
    ).rejects.toThrow(ConflictException);
    expect(prismaMock.serviceCredit.create).not.toHaveBeenCalled();
  });

  it('proposing a credit against a breached measurement opens a SERVICE_CREDIT commercial approval', async () => {
    measurementMock.getMeasurementById.mockResolvedValue({ id: 'm-1', breached: true, contract_id: 'c-1', evidence_ref: 'evd-1' });
    prismaMock.serviceCredit.create.mockResolvedValue({ id: 'credit-1', status: 'PROPOSED' });
    approvalMock.requestApproval.mockResolvedValue({ id: 'appr-1' });
    prismaMock.serviceCredit.update.mockResolvedValue({ id: 'credit-1', approval_id: 'appr-1' });

    await service.proposeCredit({ slaMeasurementId: 'm-1', amount: 250, proposedBy: 'ops' });

    expect(approvalMock.requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({ changeType: 'SERVICE_CREDIT', objectType: 'ServiceCredit' }),
    );
  });

  it('posting requires the credit to be APPROVED first', async () => {
    prismaMock.serviceCredit.findUnique.mockResolvedValue({ id: 'credit-1', status: 'PROPOSED' });

    await expect(service.postCredit('credit-1', 'inv-1')).rejects.toThrow(ConflictException);
    expect(invoiceMock.issueCreditNote).not.toHaveBeenCalled();
  });

  it('posting an approved credit issues an append-only credit note against the given invoice', async () => {
    prismaMock.serviceCredit.findUnique.mockResolvedValue({ id: 'credit-1', status: 'APPROVED', amount: 250, sla_measurement_id: 'm-1' });
    invoiceMock.issueCreditNote.mockResolvedValue({ id: 'cn-1' });
    prismaMock.serviceCredit.update.mockResolvedValue({ id: 'credit-1', status: 'POSTED', credit_note_id: 'cn-1' });

    const credit = await service.postCredit('credit-1', 'inv-1');

    expect(invoiceMock.issueCreditNote).toHaveBeenCalledWith('inv-1', 250, expect.any(String));
    expect(credit.status).toBe('POSTED');
  });

  it('rejects an illegal transition (e.g. deciding an already-posted credit)', async () => {
    prismaMock.serviceCredit.findUnique.mockResolvedValue({ id: 'credit-1', status: 'POSTED', approval_id: 'appr-1' });

    await expect(service.decideCredit('credit-1', 'finance', 'APPROVED', 'x')).rejects.toThrow(ConflictException);
  });
});
