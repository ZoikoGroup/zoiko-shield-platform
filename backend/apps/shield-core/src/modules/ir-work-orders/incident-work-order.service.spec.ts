import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { IncidentWorkOrderService } from './incident-work-order.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';

describe('IncidentWorkOrderService (ZS-COM-BILL-001 Part 15: no surprise IR charges)', () => {
  let service: IncidentWorkOrderService;
  let prismaMock: any;
  let approvalMock: any;

  beforeEach(async () => {
    prismaMock = {
      serviceObligation: { findFirst: jest.fn() },
      incidentWorkOrder: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      commercialApproval: { findFirst: jest.fn() },
    };
    approvalMock = { requestApproval: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncidentWorkOrderService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CommercialApprovalService, useValue: approvalMock },
      ],
    }).compile();

    service = module.get<IncidentWorkOrderService>(IncidentWorkOrderService);
  });

  it('fails closed when the contract has no active IR_RETAINER obligation', async () => {
    prismaMock.serviceObligation.findFirst.mockResolvedValue(null);

    await expect(
      service.activate({ contractId: 'c-1', incidentReference: 'inc-1', activationReason: 'ransomware', authorizedBy: 'ciso' }),
    ).rejects.toThrow(ConflictException);
    expect(prismaMock.incidentWorkOrder.create).not.toHaveBeenCalled();
  });

  it('logs hours normally while within included_hours', async () => {
    prismaMock.incidentWorkOrder.findUnique.mockResolvedValue({
      id: 'wo-1', status: 'ACTIVE', included_hours: 10, consumed_hours: 3, overage_policy: 'BLOCK',
    });
    prismaMock.incidentWorkOrder.update.mockResolvedValue({ id: 'wo-1', consumed_hours: 8 });

    await service.logHours('wo-1', { hours: 5 });

    expect(prismaMock.incidentWorkOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { consumed_hours: 8 } }),
    );
  });

  it('BLOCK policy rejects any hours that would exceed included_hours', async () => {
    prismaMock.incidentWorkOrder.findUnique.mockResolvedValue({
      id: 'wo-1', status: 'ACTIVE', included_hours: 10, consumed_hours: 8, overage_policy: 'BLOCK',
    });

    await expect(service.logHours('wo-1', { hours: 5 })).rejects.toThrow(ConflictException);
    expect(prismaMock.incidentWorkOrder.update).not.toHaveBeenCalled();
  });

  it('ALLOW_CAPPED policy allows overage up to the pre-authorized cap', async () => {
    prismaMock.incidentWorkOrder.findUnique.mockResolvedValue({
      id: 'wo-1', status: 'ACTIVE', included_hours: 10, consumed_hours: 8, overage_policy: 'ALLOW_CAPPED', overage_cap_hours: 5,
    });
    prismaMock.incidentWorkOrder.update.mockResolvedValue({ id: 'wo-1', consumed_hours: 12 });

    await service.logHours('wo-1', { hours: 4 }); // 2h over included, within the 5h cap

    expect(prismaMock.incidentWorkOrder.update).toHaveBeenCalled();
  });

  it('ALLOW_CAPPED policy rejects overage beyond the pre-authorized cap', async () => {
    prismaMock.incidentWorkOrder.findUnique.mockResolvedValue({
      id: 'wo-1', status: 'ACTIVE', included_hours: 10, consumed_hours: 8, overage_policy: 'ALLOW_CAPPED', overage_cap_hours: 1,
    });

    await expect(service.logHours('wo-1', { hours: 4 })).rejects.toThrow(ConflictException); // 2h over, cap is 1h
  });

  it('REQUIRE_APPROVAL policy blocks overage until an APPROVED OVERAGE_OVERRIDE approval exists', async () => {
    prismaMock.incidentWorkOrder.findUnique.mockResolvedValue({
      id: 'wo-1', status: 'ACTIVE', included_hours: 10, consumed_hours: 8, overage_policy: 'REQUIRE_APPROVAL',
    });
    prismaMock.commercialApproval.findFirst.mockResolvedValue(null);

    await expect(service.logHours('wo-1', { hours: 5 })).rejects.toThrow(ConflictException);
  });

  it('REQUIRE_APPROVAL policy allows overage once an APPROVED OVERAGE_OVERRIDE approval exists', async () => {
    prismaMock.incidentWorkOrder.findUnique.mockResolvedValue({
      id: 'wo-1', status: 'ACTIVE', included_hours: 10, consumed_hours: 8, overage_policy: 'REQUIRE_APPROVAL',
    });
    prismaMock.commercialApproval.findFirst.mockResolvedValue({ id: 'appr-1', status: 'APPROVED' });
    prismaMock.incidentWorkOrder.update.mockResolvedValue({ id: 'wo-1', consumed_hours: 13 });

    await service.logHours('wo-1', { hours: 5 });

    expect(prismaMock.incidentWorkOrder.update).toHaveBeenCalled();
  });

  it('rejects logging hours against a closed work order', async () => {
    prismaMock.incidentWorkOrder.findUnique.mockResolvedValue({ id: 'wo-1', status: 'CLOSED' });

    await expect(service.logHours('wo-1', { hours: 1 })).rejects.toThrow(ConflictException);
  });
});
