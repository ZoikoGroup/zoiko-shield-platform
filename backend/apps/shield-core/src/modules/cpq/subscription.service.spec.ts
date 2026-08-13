import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';

describe('SubscriptionService amendments (routed through the generic CommercialApprovalService)', () => {
  let service: SubscriptionService;
  let prismaMock: any;
  let approvalMock: any;

  beforeEach(async () => {
    prismaMock = {
      commercialSubscription: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      commercialAmendment: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    approvalMock = {
      requestApproval: jest.fn(),
      decideApproval: jest.fn(),
      getApprovalByObject: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CommercialApprovalService, useValue: approvalMock },
      ],
    }).compile();

    service = module.get<SubscriptionService>(SubscriptionService);
  });

  it('requesting an amendment opens a linked CommercialApproval via the generic engine', async () => {
    prismaMock.commercialSubscription.findUnique.mockResolvedValue({
      id: 'sub-1',
      status: 'ACTIVE',
    });
    prismaMock.commercialAmendment.create.mockResolvedValue({
      id: 'amend-1',
      status: 'REQUESTED',
    });
    prismaMock.commercialAmendment.update.mockResolvedValue({
      id: 'amend-1',
      status: 'REQUESTED',
    });
    approvalMock.requestApproval.mockResolvedValue({
      id: 'appr-1',
      status: 'PENDING_APPROVAL',
    });

    await service.requestAmendment('sub-1', {
      amendmentType: 'UPGRADE',
      requestedBy: 'alice',
    });

    expect(approvalMock.requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        objectType: 'CommercialAmendment',
        objectId: 'amend-1',
        requestedBy: 'alice',
      }),
    );
  });

  it('deciding an amendment delegates the maker-checker decision to CommercialApprovalService', async () => {
    prismaMock.commercialAmendment.findUnique.mockResolvedValue({
      id: 'amend-1',
      status: 'REQUESTED',
      requested_by: 'alice',
    });
    approvalMock.getApprovalByObject.mockResolvedValue({ id: 'appr-1' });
    approvalMock.decideApproval.mockResolvedValue({
      id: 'appr-1',
      status: 'APPROVED',
    });
    prismaMock.commercialAmendment.update.mockResolvedValue({
      id: 'amend-1',
      status: 'APPROVED',
    });

    const result = await service.decideAmendment(
      'amend-1',
      'bob',
      'APPROVED',
      'looks fine',
    );

    expect(approvalMock.decideApproval).toHaveBeenCalledWith(
      'appr-1',
      'bob',
      'APPROVED',
      'looks fine',
    );
    expect(result.status).toBe('APPROVED');
  });

  it('rejects deciding an amendment that is already settled, without calling the approval engine', async () => {
    prismaMock.commercialAmendment.findUnique.mockResolvedValue({
      id: 'amend-1',
      status: 'APPLIED',
    });

    await expect(
      service.decideAmendment('amend-1', 'bob', 'APPROVED', 'x'),
    ).rejects.toThrow(ConflictException);
    expect(approvalMock.getApprovalByObject).not.toHaveBeenCalled();
  });

  it('createSubscription writes through a provided transaction client when given one', async () => {
    const txMock = {
      commercialSubscription: {
        create: jest.fn().mockResolvedValue({ id: 'sub-1' }),
      },
    };

    await service.createSubscription(
      { orderId: 'o-1', commercialAccountId: 'acct-1', contractId: 'c-1' },
      txMock as any,
    );

    expect(txMock.commercialSubscription.create).toHaveBeenCalled();
    expect(prismaMock.commercialSubscription.create).not.toHaveBeenCalled();
  });
});
