import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { CommercialApprovalService } from './commercial-approval.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('CommercialApprovalService (maker-checker, ZS-COM-BILL-001 Part 20)', () => {
  let service: CommercialApprovalService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      commercialApproval: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      commercialEvent: { create: jest.fn() },
      $transaction: jest.fn().mockImplementation((cb) => cb(prismaMock)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommercialApprovalService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<CommercialApprovalService>(CommercialApprovalService);
  });

  it('creates a request directly in PENDING_APPROVAL and emits a CommercialEvent', async () => {
    prismaMock.commercialApproval.create.mockResolvedValue({
      id: 'appr-1',
      status: 'PENDING_APPROVAL',
    });

    const approval = await service.requestApproval({
      changeType: 'NON_STANDARD_DISCOUNT',
      objectType: 'CommercialQuote',
      objectId: 'q-1',
      requestedBy: 'alice',
      reason: 'launch discount',
    });

    expect(approval.status).toBe('PENDING_APPROVAL');
    expect(prismaMock.commercialEvent.create).toHaveBeenCalled();
  });

  it('rejects a decision made by the same actor who requested it (maker != checker)', async () => {
    prismaMock.commercialApproval.findUnique.mockResolvedValue({
      id: 'appr-1',
      status: 'PENDING_APPROVAL',
      requested_by: 'alice',
    });

    await expect(
      service.decideApproval('appr-1', 'alice', 'APPROVED', 'looks fine'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows a different actor to approve', async () => {
    prismaMock.commercialApproval.findUnique.mockResolvedValue({
      id: 'appr-1',
      status: 'PENDING_APPROVAL',
      requested_by: 'alice',
      object_type: 'CommercialQuote',
    });
    prismaMock.commercialApproval.update.mockResolvedValue({
      id: 'appr-1',
      status: 'APPROVED',
    });

    const result = await service.decideApproval(
      'appr-1',
      'bob',
      'APPROVED',
      'looks fine',
    );

    expect(result.status).toBe('APPROVED');
  });

  it('rejects an illegal transition (e.g. deciding an already-applied approval)', async () => {
    prismaMock.commercialApproval.findUnique.mockResolvedValue({
      id: 'appr-1',
      status: 'APPLIED',
      requested_by: 'alice',
      object_type: 'CommercialQuote',
    });

    await expect(
      service.decideApproval('appr-1', 'bob', 'APPROVED', 'x'),
    ).rejects.toThrow(ConflictException);
  });

  it('dynamically expires a PENDING_APPROVAL past its expires_at and rejects the decision', async () => {
    const pastExpiry = new Date(Date.now() - 1000);
    prismaMock.commercialApproval.findUnique.mockResolvedValue({
      id: 'appr-1',
      status: 'PENDING_APPROVAL',
      requested_by: 'alice',
      expires_at: pastExpiry,
    });
    prismaMock.commercialApproval.update.mockResolvedValue({
      id: 'appr-1',
      status: 'EXPIRED',
    });

    await expect(
      service.decideApproval('appr-1', 'bob', 'APPROVED', 'x'),
    ).rejects.toThrow(ConflictException);
    expect(prismaMock.commercialApproval.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'EXPIRED' } }),
    );
  });

  it('finds an approval by its linked object (used by amendments)', async () => {
    prismaMock.commercialApproval.findFirst = jest
      .fn()
      .mockResolvedValue({ id: 'appr-1', status: 'PENDING_APPROVAL' });

    const approval = await service.getApprovalByObject(
      'CommercialAmendment',
      'amend-1',
    );

    expect(approval.id).toBe('appr-1');
  });
});
